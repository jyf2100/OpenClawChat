use rusqlite::Connection;
use serde_json::Value;

pub struct TemplateRepository<'a> {
    conn: &'a Connection,
}

impl<'a> TemplateRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT payload_json FROM templates ORDER BY updated_at DESC, created_at DESC",
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
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("未命名模板");
        let description = payload.get("description").and_then(Value::as_str);
        let use_default_model = payload
            .get("useDefaultModel")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let model = payload.get("model").and_then(Value::as_str);
        let selected_skills = payload.get("selectedSkills").cloned().unwrap_or(Value::Array(vec![]));
        let selected_skills_json =
            serde_json::to_string(&selected_skills).unwrap_or_else(|_| "[]".to_string());
        let files = payload.get("files").cloned().unwrap_or(Value::Object(Default::default()));
        let files_json = serde_json::to_string(&files).unwrap_or_else(|_| "{}".to_string());
        let source = payload.get("source").and_then(Value::as_str).unwrap_or("custom");
        let created_at = payload.get("createdAt").and_then(Value::as_i64).unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        });
        let updated_at = payload.get("updatedAt").and_then(Value::as_i64).unwrap_or(created_at);
        let payload_json = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());

        self.conn.execute(
            "
            INSERT INTO templates (
              id, name, description, use_default_model, model, selected_skills_json, files_json, source, payload_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              use_default_model = excluded.use_default_model,
              model = excluded.model,
              selected_skills_json = excluded.selected_skills_json,
              files_json = excluded.files_json,
              source = excluded.source,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            ",
            rusqlite::params![
                id,
                name,
                description,
                use_default_model as i64,
                model,
                selected_skills_json,
                files_json,
                source,
                payload_json,
                created_at,
                updated_at
            ],
        )?;

        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM templates WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}
