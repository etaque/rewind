use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::db;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
}

/// List all profiles for an account.
pub async fn list_profiles(account_id: &str) -> Result<Vec<Profile>> {
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

/// Create a new profile for an account.
pub async fn create_profile(account_id: &str, name: &str) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        anyhow::bail!("Profile name cannot be empty");
    }
    if name.len() > 20 {
        anyhow::bail!("Profile name cannot exceed 20 characters");
    }

    // Check profile count limit (max 10 profiles per account)
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM profiles WHERE account_id = ?",
    )
    .bind(account_id)
    .fetch_one(db::pool())
    .await?;

    if count >= 10 {
        anyhow::bail!("Maximum of 10 profiles per account");
    }

    let profile_id = uuid::Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO profiles (id, account_id, name) VALUES (?, ?, ?)")
        .bind(&profile_id)
        .bind(account_id)
        .bind(name)
        .execute(db::pool())
        .await?;

    log::info!("Created profile {} for account {}", profile_id, account_id);

    Ok(Profile {
        id: profile_id,
        name: name.to_string(),
    })
}

/// Update a profile's name.
pub async fn update_profile(account_id: &str, profile_id: &str, name: &str) -> Result<Profile> {
    let name = name.trim();
    if name.is_empty() {
        anyhow::bail!("Profile name cannot be empty");
    }
    if name.len() > 20 {
        anyhow::bail!("Profile name cannot exceed 20 characters");
    }

    // Verify the profile belongs to this account
    let result = sqlx::query(
        "UPDATE profiles SET name = ? WHERE id = ? AND account_id = ?",
    )
    .bind(name)
    .bind(profile_id)
    .bind(account_id)
    .execute(db::pool())
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("Profile not found");
    }

    Ok(Profile {
        id: profile_id.to_string(),
        name: name.to_string(),
    })
}

/// Delete a profile.
/// Note: Race results are kept - they reference the profile_id which remains valid.
pub async fn delete_profile(account_id: &str, profile_id: &str) -> Result<()> {
    // Don't allow deleting the last profile
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM profiles WHERE account_id = ?",
    )
    .bind(account_id)
    .fetch_one(db::pool())
    .await?;

    if count <= 1 {
        anyhow::bail!("Cannot delete the last profile");
    }

    // Verify the profile belongs to this account and delete
    let result = sqlx::query(
        "DELETE FROM profiles WHERE id = ? AND account_id = ?",
    )
    .bind(profile_id)
    .bind(account_id)
    .execute(db::pool())
    .await?;

    if result.rows_affected() == 0 {
        anyhow::bail!("Profile not found");
    }

    log::info!("Deleted profile {} from account {}", profile_id, account_id);

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth;

    async fn setup_test_account() -> (String, String) {
        db::init_test().await.unwrap();

        // Create a test account with verification
        let email = format!("test{}@example.com", uuid::Uuid::new_v4());
        auth::start_auth(&email).await.unwrap();

        // Get the code
        let (code,): (String,) = sqlx::query_as(
            "SELECT code FROM verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(&email)
        .fetch_one(db::pool())
        .await
        .unwrap();

        let result = auth::verify_auth(&email, &code).await.unwrap();
        (result.account_id, result.profiles[0].id.clone())
    }

    #[tokio::test]
    async fn test_list_profiles() {
        let (account_id, _) = setup_test_account().await;

        let profiles = list_profiles(&account_id).await.unwrap();
        assert_eq!(profiles.len(), 1); // Default profile
    }

    #[tokio::test]
    async fn test_create_profile() {
        let (account_id, _) = setup_test_account().await;

        let profile = create_profile(&account_id, "Sophie").await.unwrap();
        assert_eq!(profile.name, "Sophie");
        assert!(!profile.id.is_empty());

        let profiles = list_profiles(&account_id).await.unwrap();
        assert_eq!(profiles.len(), 2);
    }

    #[tokio::test]
    async fn test_update_profile() {
        let (account_id, profile_id) = setup_test_account().await;

        let profile = update_profile(&account_id, &profile_id, "NewName").await.unwrap();
        assert_eq!(profile.name, "NewName");
    }

    #[tokio::test]
    async fn test_delete_profile() {
        let (account_id, default_profile_id) = setup_test_account().await;

        // Create a second profile
        let new_profile = create_profile(&account_id, "Second").await.unwrap();

        // Delete the second profile
        delete_profile(&account_id, &new_profile.id).await.unwrap();

        let profiles = list_profiles(&account_id).await.unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, default_profile_id);
    }

    #[tokio::test]
    async fn test_cannot_delete_last_profile() {
        let (account_id, profile_id) = setup_test_account().await;

        let result = delete_profile(&account_id, &profile_id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("last profile"));
    }

    #[tokio::test]
    async fn test_profile_name_validation() {
        let (account_id, _) = setup_test_account().await;

        // Empty name
        let result = create_profile(&account_id, "").await;
        assert!(result.is_err());

        // Name too long
        let result = create_profile(&account_id, "A very long name that exceeds twenty chars").await;
        assert!(result.is_err());
    }
}
