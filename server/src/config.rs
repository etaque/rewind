use once_cell::sync::Lazy;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct S3Config {
    pub bucket: String,
    pub endpoint: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(flatten)]
    pub s3: S3Config,
}

pub static CONFIG: Lazy<Config> = Lazy::new(|| {
    envy::prefixed("REWIND_S3_")
        .from_env::<S3Config>()
        .map(|s3| Config { s3 })
        .expect("Missing S3 config. Required env vars: REWIND_S3_BUCKET, REWIND_S3_ENDPOINT, REWIND_S3_REGION, REWIND_S3_ACCESS_KEY, REWIND_S3_SECRET_KEY")
});

pub fn config() -> &'static Config {
    &CONFIG
}
