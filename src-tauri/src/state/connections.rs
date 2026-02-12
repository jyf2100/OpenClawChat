// 连接池管理
use crate::protocol::websocket::{WsConnectionPool, WsClientError};
use crate::protocol::types::{ConnectionStatus, EventMessage};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ConnectionState {
    pool: Arc<RwLock<WsConnectionPool>>,
}

impl ConnectionState {
    pub fn new() -> Self {
        Self {
            pool: Arc::new(RwLock::new(WsConnectionPool::new())),
        }
    }

    pub fn pool(&self) -> Arc<RwLock<WsConnectionPool>> {
        self.pool.clone()
    }
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ConnectionManager {
    pool: Arc<RwLock<WsConnectionPool>>,
}

impl ConnectionManager {
    pub fn new(pool: Arc<RwLock<WsConnectionPool>>) -> Self {
        Self { pool }
    }

    pub async fn connect(&self, gateway_id: String, url: String, token: Option<String>, event_callback: impl Fn(EventMessage) + Send + 'static) -> Result<(), String> {
        self.pool.write().await.create_connection(gateway_id, url, token, event_callback).await.map_err(|e| e.to_string())
    }

    pub async fn disconnect(&self, gateway_id: &str) -> Result<(), String> {
        self.pool.write().await.remove_connection(gateway_id).await.map_err(|e| e.to_string())
    }

    pub async fn send_message(&self, gateway_id: &str, session_key: String, message: String) -> Result<serde_json::Value, String> {
        let pool = self.pool.read().await;
        let client = pool.get_connection(gateway_id).await.ok_or_else(|| format!("网关 {} 未连接", gateway_id))?;
        client.send_message(session_key, message).await.map_err(|e| e.to_string())
    }

    pub async fn get_status(&self, gateway_id: &str) -> Result<ConnectionStatus, String> {
        let pool = self.pool.read().await;
        let client = pool.get_connection(gateway_id).await.ok_or_else(|| format!("网关 {} 未连接", gateway_id))?;
        Ok(client.get_status().await)
    }

    pub async fn get_all_status(&self) -> Vec<ConnectionStatus> {
        self.pool.read().await.get_all_status().await
    }

    pub async fn has_connection(&self, gateway_id: &str) -> bool {
        self.pool.read().await.get_connection(gateway_id).await.is_some()
    }
}
