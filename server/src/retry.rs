use rand::Rng;
use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Internal error type to distinguish retryable vs non-retryable failures.
pub enum RetryError {
    /// Retryable error (network issues, server errors, mid-stream failures)
    Retryable(anyhow::Error),
    /// Non-retryable error (client errors like 4xx except 404)
    NonRetryable(anyhow::Error),
}

pub struct RetryConfig {
    /// Maximum number of retry attempts for NCAR downloads.
    max_retries: u32,
    /// Base delay for exponential backoff (2 seconds).
    base_delay_ms: u64,
    /// Maximum jitter to add to backoff delay (as fraction of delay, e.g., 0.25 = ±25%).
    jitter_factor: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        RetryConfig {
            max_retries: 4,
            base_delay_ms: 2000,
            jitter_factor: 0.25,
        }
    }
}

pub async fn with_retry<F, Fut, T>(func: F, config: &RetryConfig) -> Result<T, RetryError>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, RetryError>>,
{
    for attempt in 0..config.max_retries {
        match func().await {
            Ok(result) => return Ok(result),
            Err(RetryError::Retryable(err)) => {
                log::warn!("Retryable error: {}", err);
                let delay = backoff_with_jitter(attempt, config);
                log::warn!(
                    "Retry attempt {}/{} after {:?}",
                    attempt + 1,
                    config.max_retries,
                    delay
                );
                sleep(delay).await;
            }
            Err(err) => return Err(err),
        }
    }
    Err(RetryError::Retryable(anyhow::anyhow!(
        "Max retries exceeded"
    )))
}

/// Calculate backoff delay with jitter for a given attempt.
///
/// Uses exponential backoff: base_delay * 2^attempt
/// Adds random jitter of ±JITTER_FACTOR to prevent thundering herd.
fn backoff_with_jitter(attempt: u32, config: &RetryConfig) -> Duration {
    let base_delay = config.base_delay_ms * 2u64.pow(attempt);
    let jitter_range = (base_delay as f64 * config.jitter_factor) as u64;
    let jitter = rand::rng().random_range(0..=jitter_range * 2) as i64 - jitter_range as i64;
    let delay_ms = (base_delay as i64 + jitter).max(0) as u64;
    Duration::from_millis(delay_ms)
}
