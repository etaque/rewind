use config;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Conf {
    pub database_url: String,
}

impl Conf {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        let mut cfg = config::Config::new();
        cfg.merge(config::Environment::with_prefix("rewind"))?;
        cfg.try_into()
    }
}
