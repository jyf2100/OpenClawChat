use rusqlite::Connection;
use serde_json::Value;

pub struct RoomRepository<'a> {
    conn: &'a Connection,
}

impl<'a> RoomRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT payload_json FROM rooms ORDER BY updated_at DESC, created_at DESC")?;
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

    pub fn upsert(&self, id: &str, payload: &Value) -> Result<(), rusqlite::Error> {
        let gateway_id = payload.get("gatewayId").and_then(Value::as_str).unwrap_or("");
        let project_id = payload.get("projectId").and_then(Value::as_str);
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("未命名房间");
        let room_type = payload.get("type").and_then(Value::as_str).unwrap_or("channel");
        let unread_count = payload.get("unreadCount").and_then(Value::as_i64).unwrap_or(0);
        let pinned = payload.get("pinned").and_then(Value::as_bool);
        let order_index = payload.get("order").and_then(Value::as_i64);
        let room_type_ext = payload.get("roomType").and_then(Value::as_str);
        let collaboration = payload.get("collaboration").cloned().unwrap_or(Value::Null);
        let collaboration_json =
            serde_json::to_string(&collaboration).unwrap_or_else(|_| "null".to_string());
        let last_message = payload.get("lastMessage").cloned().unwrap_or(Value::Null);
        let last_message_json =
            serde_json::to_string(&last_message).unwrap_or_else(|_| "null".to_string());
        let payload_json = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        self.conn.execute(
            "
            INSERT INTO rooms (
              id, gateway_id, project_id, name, type, unread_count, pinned, order_index, room_type, collaboration_json, last_message_json, payload_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              gateway_id = excluded.gateway_id,
              project_id = excluded.project_id,
              name = excluded.name,
              type = excluded.type,
              unread_count = excluded.unread_count,
              pinned = excluded.pinned,
              order_index = excluded.order_index,
              room_type = excluded.room_type,
              collaboration_json = excluded.collaboration_json,
              last_message_json = excluded.last_message_json,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            ",
            rusqlite::params![
                id,
                gateway_id,
                project_id,
                name,
                room_type,
                unread_count,
                pinned.map(|v| v as i64),
                order_index,
                room_type_ext,
                collaboration_json,
                last_message_json,
                payload_json,
                now,
                now
            ],
        )?;

        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM rooms WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}
