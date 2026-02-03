use anyhow::Result;
use rand::Rng;
use rusqlite::{Connection, params};
use serde::Serialize;

/// Player record for verified users
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: i64,
    pub email: String,
    pub auth_token: String,
    pub name: Option<String>,
    pub email_verified_at: i64,
    pub created_at: i64,
}

/// Player info returned to client (email partially masked)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfo {
    pub email: String,
    pub name: Option<String>,
    pub verified_at: i64,
}

impl From<Player> for PlayerInfo {
    fn from(player: Player) -> Self {
        PlayerInfo {
            email: mask_email(&player.email),
            name: player.name,
            verified_at: player.email_verified_at,
        }
    }
}

/// Mask email for display (e.g., "j***@example.com")
fn mask_email(email: &str) -> String {
    if let Some(at_pos) = email.find('@') {
        let local = &email[..at_pos];
        let domain = &email[at_pos..];
        if local.len() <= 1 {
            format!("*{}", domain)
        } else {
            format!("{}***{}", &local[..1], domain)
        }
    } else {
        "***".to_string()
    }
}

/// Email verification token
#[derive(Debug, Clone)]
pub struct VerificationToken {
    pub email: String,
    pub name: Option<String>,
}

/// Initialize the players tables
pub fn init_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            auth_token TEXT UNIQUE NOT NULL,
            name TEXT,
            email_verified_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
        CREATE INDEX IF NOT EXISTS idx_players_auth_token ON players(auth_token);

        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_verification_tokens_email ON email_verification_tokens(email);
        ",
    )?;

    Ok(())
}

/// Generate a random 32-character hex token
fn generate_token() -> String {
    let bytes: [u8; 16] = rand::rng().random();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Generate a UUID for auth tokens
fn generate_auth_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Create a new verification token and store it
pub fn create_verification_token(
    conn: &Connection,
    email: &str,
    name: Option<&str>,
) -> Result<String> {
    let token = generate_token();
    let now = chrono::Utc::now().timestamp_millis();
    let expires_at = now + (24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing tokens for this email
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE email = ?1",
        params![email],
    )?;

    // Insert new token
    conn.execute(
        "INSERT INTO email_verification_tokens (token, email, name, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![token, email, name, expires_at, now],
    )?;

    Ok(token)
}

/// Get a verification token if it exists and is not expired
pub fn get_verification_token(conn: &Connection, token: &str) -> Result<Option<VerificationToken>> {
    let now = chrono::Utc::now().timestamp_millis();

    let mut stmt = conn.prepare(
        "SELECT email, name
         FROM email_verification_tokens
         WHERE token = ?1 AND expires_at > ?2",
    )?;

    let result = stmt
        .query_row(params![token, now], |row| {
            Ok(VerificationToken {
                email: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .ok();

    Ok(result)
}

/// Delete a verification token
pub fn delete_verification_token(conn: &Connection, token: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE token = ?1",
        params![token],
    )?;
    Ok(())
}

/// Verify an email and create/update the player record
/// Returns the auth_token for the player
pub fn verify_email(conn: &Connection, token: &str) -> Result<Option<(String, String)>> {
    // Get the verification token
    let verification = match get_verification_token(conn, token)? {
        Some(v) => v,
        None => return Ok(None),
    };

    let email = &verification.email;
    let name = verification.name.as_deref();
    let now = chrono::Utc::now().timestamp_millis();

    // Check if player already exists
    let existing = get_player_by_email(conn, email)?;

    let auth_token = if let Some(player) = existing {
        // Update existing player's verification time and optionally name
        if let Some(n) = name {
            conn.execute(
                "UPDATE players SET email_verified_at = ?1, name = ?2 WHERE email = ?3",
                params![now, n, email],
            )?;
        } else {
            conn.execute(
                "UPDATE players SET email_verified_at = ?1 WHERE email = ?2",
                params![now, email],
            )?;
        }
        player.auth_token
    } else {
        // Create new player
        let auth_token = generate_auth_token();
        conn.execute(
            "INSERT INTO players (email, auth_token, name, email_verified_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![email, auth_token, name, now, now],
        )?;
        auth_token
    };

    // Delete the used token
    delete_verification_token(conn, token)?;

    // Clean up expired tokens
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE expires_at < ?1",
        params![now],
    )?;

    Ok(Some((auth_token, email.clone())))
}

/// Get a player by email
pub fn get_player_by_email(conn: &Connection, email: &str) -> Result<Option<Player>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, auth_token, name, email_verified_at, created_at
         FROM players WHERE email = ?1",
    )?;

    let result = stmt
        .query_row(params![email], |row| {
            Ok(Player {
                id: row.get(0)?,
                email: row.get(1)?,
                auth_token: row.get(2)?,
                name: row.get(3)?,
                email_verified_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .ok();

    Ok(result)
}

/// Get a player by auth token
pub fn get_player_by_auth_token(conn: &Connection, auth_token: &str) -> Result<Option<Player>> {
    let mut stmt = conn.prepare(
        "SELECT id, email, auth_token, name, email_verified_at, created_at
         FROM players WHERE auth_token = ?1",
    )?;

    let result = stmt
        .query_row(params![auth_token], |row| {
            Ok(Player {
                id: row.get(0)?,
                email: row.get(1)?,
                auth_token: row.get(2)?,
                name: row.get(3)?,
                email_verified_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .ok();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn test_mask_email() {
        assert_eq!(mask_email("john@example.com"), "j***@example.com");
        assert_eq!(mask_email("a@b.com"), "*@b.com");
        assert_eq!(mask_email("test"), "***");
    }

    #[test]
    fn test_create_and_verify_token() {
        let conn = setup_test_db();

        // Create a verification token
        let token = create_verification_token(&conn, "test@example.com", Some("TestUser")).unwrap();
        assert_eq!(token.len(), 32);

        // Token should be retrievable
        let retrieved = get_verification_token(&conn, &token).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.email, "test@example.com");
        assert_eq!(retrieved.name, Some("TestUser".to_string()));

        // Verify the email
        let result = verify_email(&conn, &token).unwrap();
        assert!(result.is_some());
        let (auth_token, email) = result.unwrap();
        assert_eq!(email, "test@example.com");
        assert!(!auth_token.is_empty());

        // Token should be deleted after verification
        let retrieved = get_verification_token(&conn, &token).unwrap();
        assert!(retrieved.is_none());

        // Player should exist
        let player = get_player_by_email(&conn, "test@example.com").unwrap();
        assert!(player.is_some());
        let player = player.unwrap();
        assert_eq!(player.name, Some("TestUser".to_string()));
        assert_eq!(player.auth_token, auth_token);
    }

    #[test]
    fn test_verify_existing_player() {
        let conn = setup_test_db();

        // Create and verify first token
        let token1 = create_verification_token(&conn, "test@example.com", Some("User1")).unwrap();
        let (auth_token1, _) = verify_email(&conn, &token1).unwrap().unwrap();

        // Create and verify second token for same email
        let token2 = create_verification_token(&conn, "test@example.com", Some("User2")).unwrap();
        let (auth_token2, _) = verify_email(&conn, &token2).unwrap().unwrap();

        // Auth token should be the same (existing player)
        assert_eq!(auth_token1, auth_token2);

        // Name should be updated
        let player = get_player_by_email(&conn, "test@example.com").unwrap().unwrap();
        assert_eq!(player.name, Some("User2".to_string()));
    }

    #[test]
    fn test_get_player_by_auth_token() {
        let conn = setup_test_db();

        let token = create_verification_token(&conn, "test@example.com", None).unwrap();
        let (auth_token, _) = verify_email(&conn, &token).unwrap().unwrap();

        let player = get_player_by_auth_token(&conn, &auth_token).unwrap();
        assert!(player.is_some());
        assert_eq!(player.unwrap().email, "test@example.com");
    }

    #[test]
    fn test_invalid_token() {
        let conn = setup_test_db();

        let result = verify_email(&conn, "invalid_token").unwrap();
        assert!(result.is_none());
    }
}
