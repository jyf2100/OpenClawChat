pub mod migrations;
pub mod repositories;
pub mod schema;

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
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

    fn run_migrations(&self) -> Result<(), rusqlite::Error> {
        migrations::run_migrations(&self.conn)
    }
}

pub fn ensure_app_database(app_data_dir: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir)?;
    }

    let db_path = app_data_dir.join("roclaw.db");
    let _db = Database::open(&db_path)?;
    Ok(db_path)
}
