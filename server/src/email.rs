use anyhow::Result;
use serde::Serialize;

use crate::config::config;

#[derive(Serialize)]
struct ResendEmail {
    from: String,
    to: String,
    subject: String,
    html: String,
}

/// Send a verification email via Resend API
pub async fn send_verification_email(to_email: &str, token: &str) -> Result<()> {
    let cfg = config();

    // Skip sending in test mode or if API key is empty
    if cfg.resend_api_key.is_empty() {
        log::warn!(
            "Resend API key not configured, skipping email send. Token: {}",
            token
        );
        return Ok(());
    }

    let verify_url = format!("{}/auth/verify?token={}", cfg.app_url, token);

    let email = ResendEmail {
        from: cfg.email_from.clone(),
        to: to_email.to_string(),
        subject: "Verify your Rewind account".to_string(),
        html: format!(
            r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #f59e0b; margin: 0; font-size: 28px;">Rewind</h1>
  </div>

  <h2 style="color: #1e293b; margin-bottom: 16px;">Verify your email</h2>

  <p style="margin-bottom: 24px;">
    Click the button below to verify your email and start saving your race results to the Hall of Fame.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    <a href="{verify_url}" style="display: inline-block; background-color: #f59e0b; color: #1e293b; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px;">
      Verify Email
    </a>
  </div>

  <p style="color: #64748b; font-size: 14px;">
    Or copy and paste this link into your browser:
  </p>
  <p style="color: #3b82f6; font-size: 14px; word-break: break-all;">
    {verify_url}
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">

  <p style="color: #94a3b8; font-size: 12px;">
    This link expires in 24 hours. If you didn't request this email, you can safely ignore it.
  </p>
</body>
</html>"#,
            verify_url = verify_url
        ),
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.resend.com/emails")
        .bearer_auth(&cfg.resend_api_key)
        .json(&email)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log::error!("Resend API error: {} - {}", status, body);
        anyhow::bail!("Failed to send verification email: {}", status);
    }

    log::info!("Verification email sent to {}", to_email);
    Ok(())
}

#[cfg(test)]
mod tests {
    // Email sending is tested manually or via integration tests
    // since it requires the Resend API key
}
