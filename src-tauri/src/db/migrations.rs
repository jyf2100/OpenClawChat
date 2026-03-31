use rusqlite::{params, Connection};
use std::time::Duration;

use super::schema::LATEST_SCHEMA_VERSION;

pub fn configure_connection(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        ",
    )?;
    Ok(())
}

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    configure_connection(conn)?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        ",
    )?;

    let current = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )?;

    for version in (current + 1)..=LATEST_SCHEMA_VERSION {
        apply_migration(conn, version)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, unixepoch())",
            params![version],
        )?;
    }

    Ok(())
}

fn apply_migration(conn: &Connection, version: i64) -> Result<(), rusqlite::Error> {
    match version {
        1 => conn.execute_batch(
            "
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
            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY,
              room_id TEXT NOT NULL,
              gateway_id TEXT,
              type TEXT,
              role TEXT,
              content_json TEXT NOT NULL,
              text_preview TEXT,
              sender TEXT,
              timestamp INTEGER NOT NULL,
              metadata_json TEXT,
              payload_json TEXT NOT NULL,
              created_at INTEGER NOT NULL DEFAULT (unixepoch()),
              updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            ",
        ),
        2 => conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp
              ON messages(room_id, timestamp DESC);
            CREATE TABLE IF NOT EXISTS documents (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_documents_project_updated
              ON documents(project_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS archives (
              id TEXT PRIMARY KEY,
              room_id TEXT,
              gateway_id TEXT,
              session_key TEXT,
              room_name TEXT,
              summary TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              archived_at INTEGER NOT NULL
            );
            ",
        ),
        3 => conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_rooms_gateway_updated
              ON rooms(gateway_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_archives_archived_at
              ON archives(archived_at DESC);
            ",
        ),
        _ => Ok(()),
    }
}
