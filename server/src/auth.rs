use anyhow::Result;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::{config::config, db, email};

const CODE_EXPIRATION_MS: i64 = 10 * 60 * 1000; // 10 minutes
const SESSION_DURATION_MS: i64 = 30 * 24 * 60 * 60 * 1000; // 30 days

/// Generate a random 6-digit verification code.
fn generate_code() -> String {
    let code: u32 = rand::rng().random_range(0..1_000_000);
    format!("{:06}", code)
}

/// Generate a secure session token.
fn generate_session_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Start authentication by sending a verification code to the email.
pub async fn start_auth(email: &str) -> Result<()> {
    let email = email.to_lowercase().trim().to_string();

    // Validate email format (basic check)
    if !email.contains('@') || !email.contains('.') {
        anyhow::bail!("Invalid email format");
    }

    let code = generate_code();
    let now = chrono::Utc::now().timestamp_millis();
    let expires_at = now + CODE_EXPIRATION_MS;

    // Insert verification code
    sqlx::query(
        "INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)",
    )
    .bind(&email)
    .bind(&code)
    .bind(expires_at)
    .execute(db::pool())
    .await?;

    // Send the code via email
    email::send_verification_code(&email, &code).await?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub account_id: String,
    pub session_token: String,
    pub profiles: Vec<Profile>,
    pub is_admin: bool,
}

/// Verify a code and create a session. Creates the account if it doesn't exist.
pub async fn verify_auth(email: &str, code: &str) -> Result<AuthResult> {
    let email = email.to_lowercase().trim().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    // Find valid, unused code
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM verification_codes
         WHERE email = ? AND code = ? AND expires_at > ? AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .bind(code)
    .bind(now)
    .fetch_optional(db::pool())
    .await?;

    let code_id = match row {
        Some((id,)) => id,
        None => anyhow::bail!("Invalid or expired code"),
    };

    // Mark code as used
    sqlx::query("UPDATE verification_codes SET used_at = ? WHERE id = ?")
        .bind(now)
        .bind(code_id)
        .execute(db::pool())
        .await?;

    // Get or create account
    let account_id = get_or_create_account(&email).await?;

    // Create session
    let session_token = generate_session_token();
    let expires_at = now + SESSION_DURATION_MS;

    sqlx::query(
        "INSERT INTO sessions (token, account_id, expires_at, last_active_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&session_token)
    .bind(&account_id)
    .bind(expires_at)
    .bind(now)
    .execute(db::pool())
    .await?;

    // Get profiles
    let profiles = get_profiles_for_account(&account_id).await?;

    // Check if this is an admin account
    let admin_email = &config().admin_email;
    let is_admin = !admin_email.is_empty() && email.to_lowercase() == admin_email.to_lowercase();

    Ok(AuthResult {
        account_id,
        session_token,
        profiles,
        is_admin,
    })
}

/// Get or create an account for the given email.
async fn get_or_create_account(email: &str) -> Result<String> {
    // Check if account exists
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM accounts WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(db::pool())
    .await?;

    if let Some((id,)) = existing {
        return Ok(id);
    }

    // Create new account
    let account_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO accounts (id, email) VALUES (?, ?)")
        .bind(&account_id)
        .bind(email)
        .execute(db::pool())
        .await?;

    // Create a default profile
    let profile_id = uuid::Uuid::new_v4().to_string();
    let default_name = email.split('@').next().unwrap_or("Player");
    sqlx::query("INSERT INTO profiles (id, account_id, name) VALUES (?, ?, ?)")
        .bind(&profile_id)
        .bind(&account_id)
        .bind(default_name)
        .execute(db::pool())
        .await?;

    log::info!("Created new account {} for {}", account_id, email);
    Ok(account_id)
}

/// Get all profiles for an account.
async fn get_profiles_for_account(account_id: &str) -> Result<Vec<Profile>> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, name FROM profiles WHERE account_id = ? ORDER BY created_at",
    )
    .bind(account_id)
    .fetch_all(db::pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name)| Profile { id, name })
        .collect())
}

/// Get the email address for an account.
pub async fn get_account_email(account_id: &str) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT email FROM accounts WHERE id = ?",
    )
    .bind(account_id)
    .fetch_optional(db::pool())
    .await?;

    Ok(row.map(|(email,)| email))
}

/// Validate a session token and return the account ID if valid.
/// Also updates last_active_at and extends expiration (sliding window).
pub async fn validate_session(token: &str) -> Result<Option<String>> {
    let now = chrono::Utc::now().timestamp_millis();

    // Get session if valid
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT account_id FROM sessions WHERE token = ? AND expires_at > ?",
    )
    .bind(token)
    .bind(now)
    .fetch_optional(db::pool())
    .await?;

    if let Some((account_id,)) = row {
        // Update last_active_at and extend expiration
        let new_expires_at = now + SESSION_DURATION_MS;
        sqlx::query("UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE token = ?")
            .bind(now)
            .bind(new_expires_at)
            .bind(token)
            .execute(db::pool())
            .await?;

        return Ok(Some(account_id));
    }

    Ok(None)
}

/// Logout by deleting the session.
pub async fn logout(token: &str) -> Result<()> {
    sqlx::query("DELETE FROM sessions WHERE token = ?")
        .bind(token)
        .execute(db::pool())
        .await?;
    Ok(())
}

/// Clean up expired sessions and verification codes.
pub async fn cleanup_expired() -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();

    let sessions_deleted = sqlx::query("DELETE FROM sessions WHERE expires_at < ?")
        .bind(now)
        .execute(db::pool())
        .await?
        .rows_affected();

    let codes_deleted = sqlx::query("DELETE FROM verification_codes WHERE expires_at < ?")
        .bind(now)
        .execute(db::pool())
        .await?
        .rows_affected();

    if sessions_deleted > 0 || codes_deleted > 0 {
        log::info!(
            "Cleaned up {} expired sessions and {} expired codes",
            sessions_deleted,
            codes_deleted
        );
    }

    Ok(())
}

// ===== Admin functions =====

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccount {
    pub id: String,
    pub email: String,
    pub created_at: i64,
    pub profile_count: i64,
    pub session_count: i64,
}

/// List accounts with pagination, ordered by creation date descending.
pub async fn list_accounts(limit: i64, offset: i64) -> Result<Vec<AdminAccount>> {
    let rows: Vec<(String, String, i64, i64, i64)> = sqlx::query_as(
        "SELECT a.id, a.email, a.created_at,
                (SELECT COUNT(*) FROM profiles WHERE account_id = a.id) as profile_count,
                (SELECT COUNT(*) FROM sessions WHERE account_id = a.id) as session_count
         FROM accounts a
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(db::pool())
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, email, created_at, profile_count, session_count)| AdminAccount {
            id,
            email,
            created_at,
            profile_count,
            session_count,
        })
        .collect())
}

/// Count total accounts.
pub async fn count_accounts() -> Result<i64> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM accounts")
        .fetch_one(db::pool())
        .await?;
    Ok(count)
}

/// Delete an account (CASCADE handles profiles + sessions).
pub async fn delete_account(account_id: &str) -> Result<()> {
    // Delete sessions and profiles first (SQLite doesn't always cascade)
    sqlx::query("DELETE FROM sessions WHERE account_id = ?")
        .bind(account_id)
        .execute(db::pool())
        .await?;
    sqlx::query("DELETE FROM profiles WHERE account_id = ?")
        .bind(account_id)
        .execute(db::pool())
        .await?;
    sqlx::query("DELETE FROM accounts WHERE id = ?")
        .bind(account_id)
        .execute(db::pool())
        .await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAuthRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAuthRequest {
    pub email: String,
    pub code: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_generate_code() {
        let code = generate_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
    }

    #[tokio::test]
    async fn test_auth_flow() {
        db::init_test().await.unwrap();

        // Start auth
        let email = "test@example.com";
        start_auth(email).await.unwrap();

        // Get the code from the database directly for testing
        let (code,): (String,) = sqlx::query_as(
            "SELECT code FROM verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(email)
        .fetch_one(db::pool())
        .await
        .unwrap();

        // Verify with correct code
        let result = verify_auth(email, &code).await.unwrap();
        assert!(!result.account_id.is_empty());
        assert!(!result.session_token.is_empty());
        assert_eq!(result.profiles.len(), 1); // Default profile created

        // Validate session
        let account_id = validate_session(&result.session_token).await.unwrap();
        assert_eq!(account_id, Some(result.account_id.clone()));

        // Logout
        logout(&result.session_token).await.unwrap();

        // Session should be invalid after logout
        let account_id = validate_session(&result.session_token).await.unwrap();
        assert_eq!(account_id, None);
    }

    #[tokio::test]
    async fn test_invalid_code() {
        db::init_test().await.unwrap();

        let email = "test2@example.com";
        start_auth(email).await.unwrap();

        // Try with wrong code
        let result = verify_auth(email, "000000").await;
        assert!(result.is_err());
    }
}
