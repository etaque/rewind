use once_cell::sync::Lazy;
use serde::Deserialize;
use std::env;

#[derive(Debug, Deserialize)]
pub struct S3Config {
    pub grib_bucket: String,
    pub raster_bucket: String,
    pub paths_bucket: String,
    pub endpoint: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

impl S3Config {
    /// Get the public URL for a raster file
    pub fn raster_url(&self, path: &str) -> String {
        format!("{}/{}/{}", self.endpoint, self.raster_bucket, path)
    }

    /// Get the public URL for a race path file
    pub fn paths_url(&self, path: &str) -> String {
        format!("{}/{}/{}", self.endpoint, self.paths_bucket, path)
    }
}

impl Default for S3Config {
    fn default() -> Self {
        S3Config {
            grib_bucket: "grib-files".to_string(),
            raster_bucket: "wind-rasters".to_string(),
            paths_bucket: "race-paths".to_string(),
            endpoint: "http://localhost:9000".to_string(),
            region: "us-east-1".to_string(),
            access_key: "test".to_string(),
            secret_key: "test".to_string(),
        }
    }
}

#[derive(Debug)]
pub struct Config {
    pub s3: S3Config,
    pub db_path: String,
    pub editor_password: String,
}

pub static CONFIG: Lazy<Config> = Lazy::new(|| {
    let s3 = if cfg!(test) {
        // Use default config for tests
        S3Config::default()
    } else {
        envy::prefixed("REWIND_S3_")
            .from_env::<S3Config>()
            .expect("Missing S3 config. Required env vars: REWIND_S3_GRIB_BUCKET, REWIND_S3_RASTER_BUCKET, REWIND_S3_ENDPOINT, REWIND_S3_REGION, REWIND_S3_ACCESS_KEY, REWIND_S3_SECRET_KEY")
    };

    let db_path = env::var("REWIND_DB_PATH").unwrap_or_else(|_| {
        if cfg!(test) {
            ":memory:".to_string()
        } else {
            "./rewind.db".to_string()
        }
    });

    let editor_password =
        env::var("REWIND_EDITOR_PASSWORD").unwrap_or_default();

    Config { s3, db_path, editor_password }
});

pub fn config() -> &'static Config {
    &CONFIG
}

/// Validate configuration at startup with clear error messages.
/// Call this early in main() to fail fast with helpful errors instead of
/// getting a cryptic "Lazy instance has previously been poisoned" later.
pub fn validate() {
    if cfg!(test) {
        return;
    }

    if let Err(e) = envy::prefixed("REWIND_S3_").from_env::<S3Config>() {
        eprintln!("ERROR: Invalid S3 configuration: {}", e);
        std::process::exit(1);
    }

    // Trigger full config initialization to catch any other errors early
    let _ = config();
    log::info!("Configuration validated successfully");
}
