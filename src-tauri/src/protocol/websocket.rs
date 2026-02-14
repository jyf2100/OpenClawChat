// WebSocket 客户端实现
use crate::protocol::types::*;
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use uuid::Uuid;

// 最大连接数限制
const MAX_CONNECTIONS: usize = 100;

#[derive(Debug, thiserror::Error)]
pub enum WsClientError {
    #[error("连接错误: {0}")]
    Connection(String),
    #[error("发送失败: {0}")]
    SendFailed(String),
    #[error("接收失败: {0}")]
    ReceiveFailed(String),
    #[error("解析错误: {0}")]
    ParseError(String),
    #[error("请求超时")]
    Timeout,
    #[error("未连接")]
    NotConnected,
    #[error("达到最大连接数限制")]
    MaxConnectionsReached,
}

pub struct WsClient {
    gateway_id: String,
    url: String,
    token: Option<String>,
    tx: Arc<StdMutex<Option<mpsc::UnboundedSender<Message>>>>,
    pending_requests: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
    event_tx: mpsc::UnboundedSender<EventMessage>,
    status: Arc<RwLock<ConnectionStatus>>,
}

impl WsClient {
    pub fn new(
        gateway_id: String,
        url: String,
        token: Option<String>,
        event_tx: mpsc::UnboundedSender<EventMessage>,
    ) -> Self {
        let gateway_id_clone = gateway_id.clone();
        Self {
            gateway_id,
            url,
            token,
            tx: Arc::new(StdMutex::new(None)),
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            status: Arc::new(RwLock::new(ConnectionStatus::disconnected(gateway_id_clone))),
        }
    }

    pub async fn connect(&self) -> Result<(), WsClientError> {
        {
            let mut status = self.status.write().await;
            *status = ConnectionStatus::connecting(self.gateway_id.clone());
        }

        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| WsClientError::Connection(e.to_string()))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let (tx, mut rx) = mpsc::unbounded_channel();
        *self.tx.lock().unwrap() = Some(tx);

        let pending_requests = self.pending_requests.clone();
        let event_tx = self.event_tx.clone();
        let status = self.status.clone();
        let gateway_id_for_status = self.gateway_id.clone();

        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(msg).await.is_err() {
                    break;
                }
            }
        });

        tokio::spawn(async move {
            while let Some(msg_result) = ws_receiver.next().await {
                match msg_result {
                    Ok(Message::Text(text)) => {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(msg_type) = parsed.get("type").and_then(|v| v.as_str()) {
                                if msg_type == "res" {
                                    if let Some(id) = parsed.get("id").and_then(|v| v.as_str()) {
                                        if let Some(tx) = pending_requests.write().await.remove(id) {
                                            let _ = tx.send(parsed);
                                        }
                                    }
                                } else if msg_type == "event" {
                                    if let Ok(event) = serde_json::from_value::<EventMessage>(parsed.clone()) {
                                        let _ = event_tx.send(event);
                                    }
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        *status.write().await = ConnectionStatus::disconnected(gateway_id_for_status.clone());
                        break;
                    }
                    Err(e) => {
                        *status.write().await = ConnectionStatus::disconnected(gateway_id_for_status.clone())
                            .with_error(e.to_string());
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub async fn disconnect(&self) {
        *self.tx.lock().unwrap() = None;
        *self.status.write().await = ConnectionStatus::disconnected(self.gateway_id.clone());
    }

    pub async fn send_request(&self, method: String, params: serde_json::Value) -> Result<serde_json::Value, WsClientError> {
        let id = Uuid::new_v4().to_string();
        let msg = ProtocolMessage::request(id.clone(), method, params);

        let tx = {
            let tx_guard = self.tx.lock().unwrap();
            tx_guard.as_ref().ok_or(WsClientError::NotConnected)?.clone()
        };

        let (response_tx, response_rx) = tokio::sync::oneshot::channel();
        self.pending_requests.write().await.insert(id.clone(), response_tx);

        tx.send(Message::Text(msg.to_json().map_err(|e| WsClientError::SendFailed(e.to_string()))?))
            .map_err(|_| WsClientError::SendFailed("发送失败".to_string()))?;

        tokio::time::timeout(tokio::time::Duration::from_secs(30), response_rx)
            .await
            .map_err(|_| WsClientError::Timeout)?
            .map_err(|_| WsClientError::ReceiveFailed("接收失败".to_string()))
    }

    pub async fn handshake(&self) -> Result<(), WsClientError> {
        let params = ConnectParams {
            min_protocol: 3,
            max_protocol: 3,
            client: ClientInfo {
                id: "webchat".to_string(),
                version: "desktop-1".to_string(),
                platform: "desktop".to_string(),
                mode: "webchat".to_string(),
            },
            role: "operator".to_string(),
            scopes: vec!["operator.admin".to_string()],
            auth: self.token.clone().map(|t| AuthInfo { token: t }),
            user_agent: "tauri-desktop".to_string(),
            locale: "zh-CN".to_string(),
        };

        let params_json = serde_json::to_value(&params).map_err(|e| WsClientError::ParseError(e.to_string()))?;
        let response = self.send_request("connect".to_string(), params_json).await?;

        if response.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
            *self.status.write().await = ConnectionStatus::connected(self.gateway_id.clone());
            return Ok(());
        }

        let error_msg = response.get("error").and_then(|e| e.get("message"))
            .and_then(|m| m.as_str()).unwrap_or("连接失败");

        *self.status.write().await = ConnectionStatus::disconnected(self.gateway_id.clone())
            .with_error(error_msg.to_string());

        Err(WsClientError::Connection(error_msg.to_string()))
    }

    pub async fn send_message(&self, session_key: String, message: String) -> Result<serde_json::Value, WsClientError> {
        let params = json!({ "sessionKey": session_key, "message": message });
        self.send_request("chat.send".to_string(), params).await
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }
}

pub struct WsConnectionPool {
    connections: Arc<DashMap<String, Arc<WsClient>>>,
}

impl WsConnectionPool {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
        }
    }

    pub async fn create_connection(&self, gateway_id: String, url: String, token: Option<String>, event_handler: impl Fn(EventMessage) + Send + 'static) -> Result<(), WsClientError> {
        // 检查连接数限制
        if self.connections.len() >= MAX_CONNECTIONS {
            return Err(WsClientError::MaxConnectionsReached);
        }

        let (event_tx, mut event_rx) = mpsc::unbounded_channel();
        let client = Arc::new(WsClient::new(gateway_id.clone(), url, token, event_tx));

        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                event_handler(event);
            }
        });

        client.clone().connect().await?;
        client.clone().handshake().await?;
        self.connections.insert(gateway_id, client);
        Ok(())
    }

    pub async fn remove_connection(&self, gateway_id: &str) -> Result<(), WsClientError> {
        if let Some((_, client)) = self.connections.remove(gateway_id) {
            client.disconnect().await;
        }
        Ok(())
    }

    pub fn get_connection(&self, gateway_id: &str) -> Option<Arc<WsClient>> {
        self.connections.get(gateway_id).map(|entry| entry.value().clone())
    }

    pub fn get_connection_count(&self) -> usize {
        self.connections.len()
    }

    pub async fn get_all_status(&self) -> Vec<ConnectionStatus> {
        let mut statuses = Vec::new();
        for entry in self.connections.iter() {
            statuses.push(entry.value().get_status().await);
        }
        statuses
    }

    /// 使用 DashMap 提供更细粒度的并发访问
    pub fn _get_status(&self, _gateway_id: &str) -> Option<ConnectionStatus> {
        // DashMap 提供更细粒度的锁，但获取状态仍需要异步运行时
        // 此方法保留供将来使用
        None
    }
}

impl Default for WsConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}
