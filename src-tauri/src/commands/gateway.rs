// 网关相关 Tauri 命令
use crate::protocol::types::{ConnectionStatus, EventMessage};
use crate::state::ConnectionManager;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;
use std::sync::Arc;

#[tauri::command]
pub async fn gateway_connect(
    gateway_id: String,
    url: String,
    token: Option<String>,
    app: AppHandle,
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<String, String> {
    let manager = manager.read().await;

    let gateway_id_for_callback = gateway_id.clone();
    let gateway_id_for_emit = gateway_id.clone();
    let app_clone = app.clone();
    let event_callback = move |event: EventMessage| {
        let event_name = format!("gateway:{}", gateway_id_for_callback);
        let _ = app_clone.emit(event_name.as_str(), event);
    };

    manager.connect(gateway_id.clone(), url, token, event_callback).await?;
    let _ = app.emit("gateway:connected", gateway_id_for_emit.as_str());

    Ok(format!("网关 {} 连接成功", gateway_id))
}

#[tauri::command]
pub async fn gateway_disconnect(
    gateway_id: String,
    app: AppHandle,
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<String, String> {
    let manager = manager.read().await;
    manager.disconnect(&gateway_id).await?;
    let _ = app.emit("gateway:disconnected", gateway_id.as_str());
    Ok(format!("网关 {} 已断开", gateway_id))
}

#[tauri::command]
pub async fn gateway_send_message(
    gateway_id: String,
    session_key: String,
    message: String,
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<serde_json::Value, String> {
    let manager = manager.read().await;
    manager.send_message(&gateway_id, session_key, message).await
}

#[tauri::command]
pub async fn gateway_get_status(
    gateway_id: String,
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<ConnectionStatus, String> {
    let manager = manager.read().await;

    if !manager.has_connection(&gateway_id).await {
        return Ok(ConnectionStatus::disconnected(gateway_id));
    }

    manager.get_status(&gateway_id).await
}

#[tauri::command]
pub async fn gateway_get_all_status(
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<Vec<ConnectionStatus>, String> {
    let manager = manager.read().await;
    Ok(manager.get_all_status().await)
}

#[tauri::command]
pub async fn gateway_is_connected(
    gateway_id: String,
    manager: State<'_, Arc<RwLock<ConnectionManager>>>,
) -> Result<bool, String> {
    let manager = manager.read().await;
    Ok(manager.has_connection(&gateway_id).await)
}
