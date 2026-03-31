use rusqlite::Connection;
use serde_json::Value;

pub struct AgentConfigRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AgentConfigRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<Value>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT gateway_id, agent_id, payload_json FROM agent_configs ORDER BY gateway_id, agent_id",
        )?;
        let rows = stmt.query_map([], |row| {
            let gateway_id = row.get::<_, String>(0)?;
            let agent_id = row.get::<_, String>(1)?;
            let payload = row.get::<_, String>(2)?;
            Ok((gateway_id, agent_id, payload))
        })?;

        let mut items = Vec::new();
        for row in rows {
            let (gateway_id, agent_id, payload) = row?;
            let payload_value = serde_json::from_str::<Value>(&payload).unwrap_or(Value::Null);
            items.push(serde_json::json!({
                "gatewayId": gateway_id,
                "agentId": agent_id,
                "payload": payload_value,
            }));
        }
        Ok(items)
    }

    pub fn get(&self, gateway_id: &str, agent_id: &str) -> Result<Option<Value>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT payload_json FROM agent_configs WHERE gateway_id = ?1 AND agent_id = ?2 LIMIT 1",
        )?;
        let mut rows = stmt.query(rusqlite::params![gateway_id, agent_id])?;
        if let Some(row) = rows.next()? {
            let payload = row.get::<_, String>(0)?;
            let value = serde_json::from_str::<Value>(&payload).unwrap_or(Value::Null);
            return Ok(Some(value));
        }
        Ok(None)
    }

    pub fn upsert(&self, gateway_id: &str, agent_id: &str, payload: &Value) -> Result<(), rusqlite::Error> {
        let template_id = payload.get("templateId").and_then(Value::as_str);
        let template_mode = payload.get("templateMode").and_then(Value::as_str);
        let template_applied_at = payload.get("templateAppliedAt").and_then(Value::as_i64);
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
        let overrides = payload.get("overrides").cloned().unwrap_or(Value::Null);
        let overrides_json =
            serde_json::to_string(&overrides).unwrap_or_else(|_| "null".to_string());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let payload_json = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());

        self.conn.execute(
            "
            INSERT INTO agent_configs (
              gateway_id, agent_id, template_id, template_mode, template_applied_at, use_default_model, model, selected_skills_json, files_json, overrides_json, payload_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(gateway_id, agent_id) DO UPDATE SET
              template_id = excluded.template_id,
              template_mode = excluded.template_mode,
              template_applied_at = excluded.template_applied_at,
              use_default_model = excluded.use_default_model,
              model = excluded.model,
              selected_skills_json = excluded.selected_skills_json,
              files_json = excluded.files_json,
              overrides_json = excluded.overrides_json,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            ",
            rusqlite::params![
                gateway_id,
                agent_id,
                template_id,
                template_mode,
                template_applied_at,
                use_default_model as i64,
                model,
                selected_skills_json,
                files_json,
                overrides_json,
                payload_json,
                now,
                now
            ],
        )?;

        Ok(())
    }

    pub fn delete(&self, gateway_id: &str, agent_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM agent_configs WHERE gateway_id = ?1 AND agent_id = ?2",
            rusqlite::params![gateway_id, agent_id],
        )?;
        Ok(())
    }

    pub fn delete_by_gateway(&self, gateway_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM agent_configs WHERE gateway_id = ?1",
            rusqlite::params![gateway_id],
        )?;
        Ok(())
    }
}
