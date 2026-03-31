use crate::db::{repositories::{agent_configs::AgentConfigRepository, gateways::GatewayRepository, messages::MessageRepository, rooms::RoomRepository, templates::TemplateRepository}, Database};
use serde_json::Value;
use tauri::{AppHandle, Manager};

fn open_database(app: &AppHandle) -> Result<Database, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let db_path = app_data_dir.join("roclaw.db");
    Database::open(db_path).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_templates(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = open_database(&app)?;
    let repo = TemplateRepository::new(db.connection());
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_template(app: AppHandle, id: String, payload: Value) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = TemplateRepository::new(db.connection());
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_template(app: AppHandle, id: String) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = TemplateRepository::new(db.connection());
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_gateways(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = open_database(&app)?;
    let repo = GatewayRepository::new(db.connection());
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_gateway(app: AppHandle, id: String, payload: Value) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = GatewayRepository::new(db.connection());
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_gateway(app: AppHandle, id: String) -> Result<(), String> {
    let db = open_database(&app)?;
    let agent_repo = AgentConfigRepository::new(db.connection());
    agent_repo.delete_by_gateway(&id).map_err(|err| err.to_string())?;
    let repo = GatewayRepository::new(db.connection());
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_get_agent_config(app: AppHandle, gateway_id: String, agent_id: String) -> Result<Option<Value>, String> {
    let db = open_database(&app)?;
    let repo = AgentConfigRepository::new(db.connection());
    repo.get(&gateway_id, &agent_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_agent_configs(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = open_database(&app)?;
    let repo = AgentConfigRepository::new(db.connection());
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_agent_config(
    app: AppHandle,
    gateway_id: String,
    agent_id: String,
    payload: Value,
) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = AgentConfigRepository::new(db.connection());
    repo.upsert(&gateway_id, &agent_id, &payload)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_agent_config(app: AppHandle, gateway_id: String, agent_id: String) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = AgentConfigRepository::new(db.connection());
    repo.delete(&gateway_id, &agent_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_rooms(app: AppHandle) -> Result<Vec<Value>, String> {
    let db = open_database(&app)?;
    let repo = RoomRepository::new(db.connection());
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_room(app: AppHandle, id: String, payload: Value) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = RoomRepository::new(db.connection());
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_room(app: AppHandle, id: String) -> Result<(), String> {
    let db = open_database(&app)?;
    let repo = RoomRepository::new(db.connection());
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_import_room_messages(app: AppHandle, room_id: String, messages: Vec<Value>) -> Result<usize, String> {
    let db = open_database(&app)?;
    let repo = MessageRepository::new(db.connection());
    repo.import_room_messages(&room_id, &messages)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_get_room_message_stats(app: AppHandle, room_id: String) -> Result<Value, String> {
    let db = open_database(&app)?;
    let repo = MessageRepository::new(db.connection());
    let count = repo.count_by_room(&room_id).map_err(|err| err.to_string())?;
    let latest_timestamp = repo
        .latest_timestamp_by_room(&room_id)
        .map_err(|err| err.to_string())?;
    Ok(serde_json::json!({
        "roomId": room_id,
        "count": count,
        "latestTimestamp": latest_timestamp,
    }))
}

#[tauri::command]
pub fn db_get_room_message_samples(
    app: AppHandle,
    room_id: String,
    ids: Vec<String>,
) -> Result<Vec<Value>, String> {
    let db = open_database(&app)?;
    let repo = MessageRepository::new(db.connection());
    repo.get_by_ids(&room_id, &ids).map_err(|err| err.to_string())
}
