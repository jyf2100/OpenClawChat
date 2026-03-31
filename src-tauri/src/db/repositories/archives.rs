use rusqlite::Connection;
use serde_json::Value;

pub struct ArchiveRepository<'a> {
    conn: &'a Connection,
}

impl<'a> ArchiveRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list_all(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT payload_json FROM archives ORDER BY archived_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            let payload = row?;
            if let Ok(value) = serde_json::from_str::<Value>(&payload) {
                items.push(value);
            }
        }
        Ok(items)
    }

    pub fn replace_all(&self, archives: &[Value]) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM archives", [])?;

        for archive in archives {
            let id = archive.get("id").and_then(Value::as_str).unwrap_or("");
            if id.is_empty() {
                continue;
            }
            let room_id = archive.get("roomId").and_then(Value::as_str);
            let gateway_id = archive.get("gatewayId").and_then(Value::as_str);
            let session_key = archive.get("sessionKey").and_then(Value::as_str);
            let room_name = archive.get("roomName").and_then(Value::as_str);
            let summary = archive.get("summary").and_then(Value::as_str).unwrap_or("");
            let archived_at = archive.get("archivedAt").and_then(Value::as_i64).unwrap_or(0);
            let payload_json = serde_json::to_string(archive).unwrap_or_else(|_| "{}".to_string());

            self.conn.execute(
                "
                INSERT INTO archives (id, room_id, gateway_id, session_key, room_name, summary, payload_json, archived_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                rusqlite::params![
                    id,
                    room_id,
                    gateway_id,
                    session_key,
                    room_name,
                    summary,
                    payload_json,
                    archived_at
                ],
            )?;
        }

        Ok(())
    }
}
