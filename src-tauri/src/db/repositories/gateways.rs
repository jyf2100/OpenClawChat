use rusqlite::Connection;
use serde_json::Value;

pub struct GatewayRepository<'a> {
    conn: &'a Connection,
}

impl<'a> GatewayRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT payload_json FROM gateways ORDER BY updated_at DESC, created_at DESC",
        )?;
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
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("未命名网关");
        let url = payload.get("url").and_then(Value::as_str).unwrap_or("");
        let token = payload.get("token").and_then(Value::as_str);
        let device_token = payload.get("deviceToken").and_then(Value::as_str);
        let status = payload.get("status").and_then(Value::as_str).unwrap_or("disconnected");
        let access_mode = payload.get("accessMode").and_then(Value::as_str);
        let token_source = payload.get("tokenSource").and_then(Value::as_str);
        let permissions = payload.get("permissions").cloned().unwrap_or(Value::Null);
        let permissions_json =
            serde_json::to_string(&permissions).unwrap_or_else(|_| "null".to_string());
        let default_model = payload.get("defaultModel").and_then(Value::as_str);
        let auto_connect = payload.get("autoConnect").and_then(Value::as_bool);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let payload_json = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());

        self.conn.execute(
            "
            INSERT INTO gateways (
              id, name, url, token, device_token, status, access_mode, token_source, permissions_json, default_model, auto_connect, payload_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              url = excluded.url,
              token = excluded.token,
              device_token = excluded.device_token,
              status = excluded.status,
              access_mode = excluded.access_mode,
              token_source = excluded.token_source,
              permissions_json = excluded.permissions_json,
              default_model = excluded.default_model,
              auto_connect = excluded.auto_connect,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            ",
            rusqlite::params![
                id,
                name,
                url,
                token,
                device_token,
                status,
                access_mode,
                token_source,
                permissions_json,
                default_model,
                auto_connect.map(|v| v as i64),
                payload_json,
                now,
                now
            ],
        )?;

        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM gateways WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}
