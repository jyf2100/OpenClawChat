// 协议类型定义
use serde::{Deserialize, Serialize};

/// OpenClaw WebSocket 协议消息类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "lowercase")]
pub enum ProtocolMessage {
    #[serde(rename = "req")]
    Request(RequestMessage),
    #[serde(rename = "res")]
    Response(ResponseMessage),
    #[serde(rename = "event")]
    Event(EventMessage),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestMessage {
    pub id: String,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseMessage {
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorDetail {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventMessage {
    pub event: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectParams {
    pub min_protocol: u32,
    pub max_protocol: u32,
    pub client: ClientInfo,
    pub role: String,
    pub scopes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthInfo>,
    pub user_agent: String,
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    pub id: String,
    pub version: String,
    pub platform: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthInfo {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub gateway_id: String,
    pub connected: bool,
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeEvent {
    pub nonce: String,
}

impl ProtocolMessage {
    pub fn request(id: String, method: String, params: serde_json::Value) -> Self {
        ProtocolMessage::Request(RequestMessage { id, method, params })
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

impl EventMessage {
    pub fn parse_payload<T: for<'de> Deserialize<'de>>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_value(self.payload.clone())
    }
}

impl ConnectionStatus {
    pub fn disconnected(gateway_id: String) -> Self {
        Self {
            gateway_id,
            connected: false,
            authenticated: false,
            error: None,
        }
    }

    pub fn connecting(gateway_id: String) -> Self {
        Self {
            gateway_id,
            connected: false,
            authenticated: false,
            error: None,
        }
    }

    pub fn connected(gateway_id: String) -> Self {
        Self {
            gateway_id,
            connected: true,
            authenticated: true,
            error: None,
        }
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.error = Some(error);
        self
    }
}
