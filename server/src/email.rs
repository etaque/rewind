use anyhow::Result;
use serde::Serialize;

use crate::config::config;

#[derive(Serialize)]
struct ResendEmailRequest {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

/// Send a verification code to the given email address using Resend API.
pub async fn send_verification_code(email: &str, code: &str) -> Result<()> {
    let cfg = config();

    // In dev mode without API key, just log the code
    if cfg.resend_api_key.is_empty() {
        log::info!("DEV MODE: Verification code for {}: {}", email, code);
        return Ok(());
    }

    let client = reqwest::Client::new();

    let request = ResendEmailRequest {
        from: cfg.email_from.clone(),
        to: vec![email.to_string()],
        subject: "Your Re:wind verification code".to_string(),
        html: format!(
            r#"<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 16px;">Re:wind</h1>
                <p style="color: #475569; margin-bottom: 24px;">Your verification code is:</p>
                <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
                    <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0f172a;">{}</span>
                </div>
                <p style="color: #94a3b8; font-size: 14px;">This code expires in 10 minutes.</p>
            </div>"#,
            code
        ),
    };

    let response = client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {}", cfg.resend_api_key))
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        anyhow::bail!("Failed to send email: {}", error_text);
    }

    log::info!("Verification code sent to {}", email);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_send_without_api_key_logs_only() {
        // Without API key set, should just log and succeed
        let result = send_verification_code("test@example.com", "123456").await;
        assert!(result.is_ok());
    }
}
