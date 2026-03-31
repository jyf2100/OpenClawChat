use crate::db::{repositories::{agent_configs::AgentConfigRepository, gateways::GatewayRepository, rooms::RoomRepository, templates::TemplateRepository}, Database};
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
