use rusqlite::Connection;
use serde_json::Value;

pub struct DocumentRepository<'a> {
    conn: &'a Connection,
}

impl<'a> DocumentRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list_all(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT payload_json FROM documents ORDER BY updated_at DESC, created_at DESC")?;
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

    pub fn replace_project(&self, project_id: &str, documents: &[Value]) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM documents WHERE project_id = ?1",
            rusqlite::params![project_id],
        )?;

        for document in documents {
            let id = document.get("id").and_then(Value::as_str).unwrap_or("");
            if id.is_empty() {
                continue;
            }
            let title = document.get("title").and_then(Value::as_str).unwrap_or("未命名文档");
            let content = document.get("content").and_then(Value::as_str).unwrap_or("");
            let created_at = document.get("createdAt").and_then(Value::as_i64).unwrap_or(0);
            let updated_at = document.get("updatedAt").and_then(Value::as_i64).unwrap_or(created_at);
            let payload_json = serde_json::to_string(document).unwrap_or_else(|_| "{}".to_string());

            self.conn.execute(
                "
                INSERT INTO documents (id, project_id, title, content, payload_json, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ",
                rusqlite::params![id, project_id, title, content, payload_json, created_at, updated_at],
            )?;
        }

        Ok(())
    }
}
