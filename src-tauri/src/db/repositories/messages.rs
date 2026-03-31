use rusqlite::Connection;
use serde_json::Value;

pub struct MessageRepository<'a> {
    conn: &'a Connection,
}

impl<'a> MessageRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn import_room_messages(&self, room_id: &str, messages: &[Value]) -> Result<usize, rusqlite::Error> {
        let mut imported = 0usize;
        for message in messages {
            let id = message.get("id").and_then(Value::as_str).unwrap_or("");
            if id.is_empty() {
                continue;
            }
            let gateway_id = message.get("gatewayId").and_then(Value::as_str);
            let message_type = message.get("type").and_then(Value::as_str);
            let role = message.get("role").and_then(Value::as_str);
            let content_json = serde_json::to_string(message.get("content").unwrap_or(&Value::Null))
                .unwrap_or_else(|_| "null".to_string());
            let text_preview = message.get("content").and_then(Value::as_str);
            let sender = message.get("sender").and_then(Value::as_str);
            let timestamp = message.get("timestamp").and_then(Value::as_i64).unwrap_or(0);
            let metadata_json = serde_json::to_string(message.get("metadata").unwrap_or(&Value::Null))
                .unwrap_or_else(|_| "null".to_string());
            let payload_json = serde_json::to_string(message).unwrap_or_else(|_| "{}".to_string());

            self.conn.execute(
                "
                INSERT INTO messages (
                  id, room_id, gateway_id, type, role, content_json, text_preview, sender, timestamp, metadata_json, payload_json, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, unixepoch(), unixepoch())
                ON CONFLICT(id) DO UPDATE SET
                  room_id = excluded.room_id,
                  gateway_id = excluded.gateway_id,
                  type = excluded.type,
                  role = excluded.role,
                  content_json = excluded.content_json,
                  text_preview = excluded.text_preview,
                  sender = excluded.sender,
                  timestamp = excluded.timestamp,
                  metadata_json = excluded.metadata_json,
                  payload_json = excluded.payload_json,
                  updated_at = unixepoch()
                ",
                rusqlite::params![
                    id,
                    room_id,
                    gateway_id,
                    message_type,
                    role,
                    content_json,
                    text_preview,
                    sender,
                    timestamp,
                    metadata_json,
                    payload_json
                ],
            )?;
            imported += 1;
        }
        Ok(imported)
    }

    pub fn count_by_room(&self, room_id: &str) -> Result<i64, rusqlite::Error> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE room_id = ?1",
            rusqlite::params![room_id],
            |row| row.get(0),
        )
    }

    pub fn latest_timestamp_by_room(&self, room_id: &str) -> Result<Option<i64>, rusqlite::Error> {
        self.conn.query_row(
            "SELECT MAX(timestamp) FROM messages WHERE room_id = ?1",
            rusqlite::params![room_id],
            |row| row.get(0),
        )
    }
}
