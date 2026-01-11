use once_cell::sync::Lazy;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct S3Config {
    pub grib_bucket: String,
    pub raster_bucket: String,
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
        .expect("Missing S3 config. Required env vars: REWIND_S3_GRIB_BUCKET, REWIND_S3_RASTER_BUCKET, REWIND_S3_ENDPOINT, REWIND_S3_REGION, REWIND_S3_ACCESS_KEY, REWIND_S3_SECRET_KEY")
});

pub fn config() -> &'static Config {
    &CONFIG
}
