use crate::db::{repositories::{agent_configs::AgentConfigRepository, archives::ArchiveRepository, documents::DocumentRepository, gateways::GatewayRepository, messages::MessageRepository, rooms::RoomRepository, templates::TemplateRepository}, DatabaseManager};
use serde_json::Value;
use tauri::State;

fn open_database(manager: &DatabaseManager) -> Result<rusqlite::Connection, String> {
    manager.open_connection().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_templates(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = TemplateRepository::new(&conn);
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_template(db: State<'_, DatabaseManager>, id: String, payload: Value) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = TemplateRepository::new(&conn);
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_template(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = TemplateRepository::new(&conn);
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_gateways(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = GatewayRepository::new(&conn);
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_gateway(db: State<'_, DatabaseManager>, id: String, payload: Value) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = GatewayRepository::new(&conn);
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_gateway(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let agent_repo = AgentConfigRepository::new(&conn);
    agent_repo.delete_by_gateway(&id).map_err(|err| err.to_string())?;
    let repo = GatewayRepository::new(&conn);
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_get_agent_config(db: State<'_, DatabaseManager>, gateway_id: String, agent_id: String) -> Result<Option<Value>, String> {
    let conn = open_database(&db)?;
    let repo = AgentConfigRepository::new(&conn);
    repo.get(&gateway_id, &agent_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_agent_configs(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = AgentConfigRepository::new(&conn);
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_agent_config(
    db: State<'_, DatabaseManager>,
    gateway_id: String,
    agent_id: String,
    payload: Value,
) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = AgentConfigRepository::new(&conn);
    repo.upsert(&gateway_id, &agent_id, &payload)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_agent_config(db: State<'_, DatabaseManager>, gateway_id: String, agent_id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = AgentConfigRepository::new(&conn);
    repo.delete(&gateway_id, &agent_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_rooms(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = RoomRepository::new(&conn);
    repo.list().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_room(db: State<'_, DatabaseManager>, id: String, payload: Value) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = RoomRepository::new(&conn);
    repo.upsert(&id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_room(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = RoomRepository::new(&conn);
    repo.delete(&id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_import_room_messages(db: State<'_, DatabaseManager>, room_id: String, messages: Vec<Value>) -> Result<usize, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.import_room_messages(&room_id, &messages)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_get_room_message_stats(db: State<'_, DatabaseManager>, room_id: String) -> Result<Value, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
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
    db: State<'_, DatabaseManager>,
    room_id: String,
    ids: Vec<String>,
) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.get_by_ids(&room_id, &ids).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_validate_room_messages(
    db: State<'_, DatabaseManager>,
    room_id: String,
    messages: Vec<Value>,
) -> Result<Value, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    let report = repo
        .validate_room_messages(&room_id, &messages)
        .map_err(|err| err.to_string())?;
    serde_json::to_value(report).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_recent_room_messages(
    db: State<'_, DatabaseManager>,
    room_id: String,
    limit: usize,
    offset: usize,
) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.list_recent_by_room(&room_id, limit, offset)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_all_messages(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.list_all().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_upsert_message(db: State<'_, DatabaseManager>, room_id: String, payload: Value) -> Result<usize, String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.upsert_message(&room_id, &payload).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_message(db: State<'_, DatabaseManager>, room_id: String, message_id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.delete_by_ids(&room_id, &[message_id]).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_messages(db: State<'_, DatabaseManager>, room_id: String, message_ids: Vec<String>) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.delete_by_ids(&room_id, &message_ids).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_clear_room_messages(db: State<'_, DatabaseManager>, room_id: String) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = MessageRepository::new(&conn);
    repo.clear_room(&room_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_documents(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = DocumentRepository::new(&conn);
    repo.list_all().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_replace_project_documents(db: State<'_, DatabaseManager>, project_id: String, documents: Vec<Value>) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = DocumentRepository::new(&conn);
    repo.replace_project(&project_id, &documents).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_archives(db: State<'_, DatabaseManager>) -> Result<Vec<Value>, String> {
    let conn = open_database(&db)?;
    let repo = ArchiveRepository::new(&conn);
    repo.list_all().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_replace_archives(db: State<'_, DatabaseManager>, archives: Vec<Value>) -> Result<(), String> {
    let conn = open_database(&db)?;
    let repo = ArchiveRepository::new(&conn);
    repo.replace_all(&archives).map_err(|err| err.to_string())
}
