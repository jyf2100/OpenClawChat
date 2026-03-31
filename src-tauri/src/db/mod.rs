pub mod migrations;
pub mod repositories;
pub mod schema;

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone)]
pub struct DatabaseManager {
    db_path: Arc<PathBuf>,
}

impl DatabaseManager {
    pub fn initialize(app_data_dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        if !app_data_dir.exists() {
            fs::create_dir_all(app_data_dir)?;
        }

        let db_path = app_data_dir.join("roclaw.db");
        let conn = Connection::open(&db_path)?;
        migrations::run_migrations(&conn)?;
        drop(conn);

        Ok(Self {
            db_path: Arc::new(db_path),
        })
    }

    pub fn db_path(&self) -> &Path {
        self.db_path.as_ref()
    }

    pub fn open_connection(&self) -> Result<Connection, rusqlite::Error> {
        let conn = Connection::open(self.db_path())?;
        migrations::configure_connection(&conn)?;
        Ok(conn)
    }
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open_with_migrations(path: impl AsRef<Path>) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        migrations::run_migrations(&conn)?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        migrations::run_migrations(&conn)?;
        Ok(Self { conn })
    }

    pub fn schema_version(&self) -> Result<i64, rusqlite::Error> {
        self.conn.query_row(
            "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
    }

    pub fn table_exists(&self, table_name: &str) -> Result<bool, rusqlite::Error> {
        self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table_name],
            |row| row.get(0),
        )
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}
