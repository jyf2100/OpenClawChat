use argon2::{
    password_hash::{
        rand_core::OsRng,
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AuthStatus {
    pub needs_setup: bool,
    pub authenticated: bool,
    pub user_id: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
}

pub struct AuthRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AuthRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn user_count(&self) -> Result<i64, rusqlite::Error> {
        self.conn.query_row("SELECT COUNT(*) FROM local_users", [], |row| row.get(0))
    }

    pub fn register(&self, email: &str, display_name: &str, password: &str) -> Result<String, String> {
        if self.user_count().map_err(|e| e.to_string())? > 0 {
            return Err("本地账号已存在".to_string());
        }

        let password_hash = hash_password(password).map_err(|e| e.to_string())?;
        let user_id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO local_users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())",
            rusqlite::params![user_id, email, display_name, password_hash],
        ).map_err(|e| e.to_string())?;
        self.create_session(&user_id)
    }

    pub fn login(&self, email: &str, password: &str) -> Result<String, String> {
        let row = self.conn.query_row(
            "SELECT id, password_hash FROM local_users WHERE email = ?1 LIMIT 1",
            rusqlite::params![email],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ).map_err(|_| "账号或密码错误".to_string())?;

        verify_password(password, &row.1).map_err(|_| "账号或密码错误".to_string())?;
        self.create_session(&row.0)
    }

    pub fn logout(&self, session_token: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM auth_sessions WHERE session_token = ?1",
            rusqlite::params![session_token],
        )?;
        Ok(())
    }

    pub fn auth_status(&self, session_token: Option<&str>) -> Result<AuthStatus, rusqlite::Error> {
        let needs_setup = self.user_count()? == 0;
        if needs_setup {
            return Ok(AuthStatus {
                needs_setup: true,
                authenticated: false,
                user_id: None,
                email: None,
                display_name: None,
            });
        }

        let Some(token) = session_token else {
            return Ok(AuthStatus {
                needs_setup: false,
                authenticated: false,
                user_id: None,
                email: None,
                display_name: None,
            });
        };

        let result = self.conn.query_row(
            "
            SELECT u.id, u.email, u.display_name
            FROM auth_sessions s
            JOIN local_users u ON u.id = s.user_id
            WHERE s.session_token = ?1
            LIMIT 1
            ",
            rusqlite::params![token],
            |row| {
                Ok(AuthStatus {
                    needs_setup: false,
                    authenticated: true,
                    user_id: Some(row.get(0)?),
                    email: Some(row.get(1)?),
                    display_name: Some(row.get(2)?),
                })
            },
        );

        match result {
            Ok(status) => Ok(status),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(AuthStatus {
                needs_setup: false,
                authenticated: false,
                user_id: None,
                email: None,
                display_name: None,
            }),
            Err(err) => Err(err),
        }
    }

    fn create_session(&self, user_id: &str) -> Result<String, String> {
        let token = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO auth_sessions (session_token, user_id, created_at) VALUES (?1, ?2, unixepoch())",
            rusqlite::params![token, user_id],
        ).map_err(|e| e.to_string())?;
        Ok(token)
    }
}

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
}

fn verify_password(password: &str, password_hash: &str) -> Result<(), argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(password_hash)?;
    Argon2::default().verify_password(password.as_bytes(), &parsed_hash)
}
