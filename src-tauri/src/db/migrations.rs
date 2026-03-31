use rusqlite::{params, Connection};

use super::schema::LATEST_SCHEMA_VERSION;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          use_default_model INTEGER NOT NULL,
          model TEXT,
          selected_skills_json TEXT NOT NULL,
          files_json TEXT NOT NULL,
          source TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gateways (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          token TEXT,
          device_token TEXT,
          status TEXT NOT NULL,
          access_mode TEXT,
          token_source TEXT,
          permissions_json TEXT,
          default_model TEXT,
          auto_connect INTEGER,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS agent_configs (
          gateway_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          template_id TEXT,
          template_mode TEXT,
          template_applied_at INTEGER,
          use_default_model INTEGER NOT NULL,
          model TEXT,
          selected_skills_json TEXT NOT NULL,
          files_json TEXT NOT NULL,
          overrides_json TEXT,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY (gateway_id, agent_id)
        );
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          gateway_id TEXT NOT NULL,
          project_id TEXT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          unread_count INTEGER NOT NULL DEFAULT 0,
          pinned INTEGER,
          order_index INTEGER,
          room_type TEXT,
          collaboration_json TEXT,
          last_message_json TEXT,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        ",
    )?;

    let current = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )?;

    if current < 1 {
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, unixepoch())",
            params![LATEST_SCHEMA_VERSION],
        )?;
    }

    Ok(())
}
