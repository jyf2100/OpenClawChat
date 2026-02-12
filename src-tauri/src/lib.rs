// Tauri 应用入口
mod commands;
mod protocol;
mod state;

use commands::*;
use state::{ConnectionState, ConnectionManager};
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ConnectionState::new())
        .invoke_handler(tauri::generate_handler![
            gateway_connect,
            gateway_disconnect,
            gateway_send_message,
            gateway_get_status,
            gateway_get_all_status,
            gateway_is_connected,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            println!("App Data Dir: {:?}", app_data_dir);
            
            // 确保 AppData 目录存在
            if !app_data_dir.exists() {
                std::fs::create_dir_all(&app_data_dir)?;
                println!("Created App Data Dir");
            }

            let connection_state = app.state::<ConnectionState>();
            let manager = Arc::new(RwLock::new(ConnectionManager::new(connection_state.pool())));
            app.manage(manager);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
