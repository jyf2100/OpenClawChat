// Tauri 应用入口
mod commands;
mod db;
mod protocol;
mod state;

use commands::*;
use db::ensure_app_database;
use state::{ConnectionState, ConnectionManager};
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Manager;

#[cfg(test)]
mod tests {
    use super::db::{repositories::messages::MessageRepository, Database};
    use serde_json::json;

    #[test]
    fn initializes_schema_migrations_table() {
        let db = Database::open_in_memory().expect("open in-memory db");
        let version = db.schema_version().expect("read schema version");
        assert_eq!(version, 1);
    }

    #[test]
    fn initializes_core_storage_tables() {
        let db = Database::open_in_memory().expect("open in-memory db");
        assert!(db.table_exists("templates").expect("templates table exists"));
        assert!(db.table_exists("gateways").expect("gateways table exists"));
        assert!(db.table_exists("agent_configs").expect("agent_configs table exists"));
        assert!(db.table_exists("rooms").expect("rooms table exists"));
        assert!(db.table_exists("messages").expect("messages table exists"));
    }

    #[test]
    fn validates_room_messages_against_database_payloads() {
        let db = Database::open_in_memory().expect("open in-memory db");
        let repo = MessageRepository::new(db.connection());
        let room_id = "room-1";
        let source = vec![
            json!({"id":"m1","roomId":room_id,"content":"hello","timestamp":1}),
            json!({"id":"m2","roomId":room_id,"content":"world","timestamp":2}),
        ];
        repo.import_room_messages(room_id, &source).expect("import");

        let report = repo
            .validate_room_messages(room_id, &source)
            .expect("validate report");

        assert_eq!(report.expected_count, 2);
        assert_eq!(report.db_count, 2);
        assert!(report.missing_ids.is_empty());
        assert!(report.mismatched_ids.is_empty());
    }

    #[test]
    fn lists_recent_room_messages_with_limit() {
        let db = Database::open_in_memory().expect("open in-memory db");
        let repo = MessageRepository::new(db.connection());
        let room_id = "room-2";
        let source = vec![
            json!({"id":"m1","roomId":room_id,"content":"1","timestamp":1}),
            json!({"id":"m2","roomId":room_id,"content":"2","timestamp":2}),
            json!({"id":"m3","roomId":room_id,"content":"3","timestamp":3}),
        ];
        repo.import_room_messages(room_id, &source).expect("import");

        let page = repo.list_recent_by_room(room_id, 2, 0).expect("recent page");
        let ids = page
            .iter()
            .map(|item| item.get("id").and_then(serde_json::Value::as_str).unwrap_or(""))
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["m3", "m2"]);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ConnectionState::new())
        .invoke_handler(tauri::generate_handler![
            clawhub_search_skills,
            gateway_connect,
            gateway_disconnect,
            gateway_send_message,
            gateway_wait_run,
            gateway_chat_history,
            gateway_request,
            gateway_get_status,
            gateway_get_all_status,
            gateway_is_connected,
            gateway_get_local_defaults,
            gateway_get_local_device_identity,
            gateway_sign_device_challenge,
            db_list_templates,
            db_upsert_template,
            db_delete_template,
            db_list_gateways,
            db_upsert_gateway,
            db_delete_gateway,
            db_list_agent_configs,
            db_get_agent_config,
            db_upsert_agent_config,
            db_delete_agent_config,
            db_list_rooms,
            db_upsert_room,
            db_delete_room,
            db_import_room_messages,
            db_get_room_message_stats,
            db_get_room_message_samples,
            db_validate_room_messages,
            db_list_recent_room_messages,
            db_list_all_messages,
            db_upsert_message,
            db_delete_message,
            db_delete_messages,
            db_clear_room_messages,
            db_list_documents,
            db_replace_project_documents,
            db_list_archives,
            db_replace_archives,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            println!("App Data Dir: {:?}", app_data_dir);
            
            // 确保 AppData 目录存在
            if !app_data_dir.exists() {
                std::fs::create_dir_all(&app_data_dir)?;
                println!("Created App Data Dir");
            }

            let db_path = ensure_app_database(&app_data_dir)?;
            println!("Database Path: {:?}", db_path);

            let connection_state = app.state::<ConnectionState>();
            let manager = Arc::new(RwLock::new(ConnectionManager::new(connection_state.pool())));
            app.manage(manager);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
