use chrono::Utc;
use clap::Parser;
use cli::{Cli, Command};

mod cli;
mod config;
mod courses;
mod db;
mod grib_png;
mod grib_store;
mod grib_stream;
mod multiplayer;
mod ncar_source;
mod retry;
mod s3;
mod s3_multipart;
mod server;
mod wind_reports;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    env_logger::init();

    // Initialize database
    db::init_db().expect("Failed to initialize database");

    let args = Cli::parse();

    match args.cmd {
        Command::Http { address } => server::run(address).await,
        Command::Sync {
            from,
            to,
            concurrency,
            pull_s3,
        } => {
            if pull_s3 {
                wind_reports::rebuild_from_s3(false).await.unwrap();
            }
            grib_store::import_grib_range(from, to.unwrap_or(Utc::now().date_naive()), concurrency)
                .await
                .unwrap()
        }
    }
}
