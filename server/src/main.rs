use chrono::Utc;
use clap::Parser;
use cli::{Cli, Command};

mod auth;
mod cli;
mod config;
mod courses;
mod db;
mod email;
mod grib_png;
mod grib_store;
mod grib_stream;
mod multiplayer;
mod ncar_source;
mod profiles;
mod race_results;
mod retry;
mod s3;
mod s3_multipart;
mod server;
mod wind_reports;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    env_logger::init();

    // Validate config early to get clear error messages on missing env vars
    config::validate();

    // Initialize database pool and run migrations
    db::init().await.expect("Failed to initialize database");

    let args = Cli::parse();

    match args.cmd {
        Command::Http { address } => server::run(address).await,
        Command::RebuildDb { truncate } => {
            wind_reports::rebuild_from_s3(truncate).await.unwrap();
        }
        Command::PullGribs {
            from,
            to,
            concurrency,
        } => {
            grib_store::import_grib_range(from, to.unwrap_or(Utc::now().date_naive()), concurrency)
                .await
                .unwrap()
        }
        Command::DumpCourses { file } => courses::dump(file).await.unwrap(),
        Command::RestoreCourses { file } => courses::restore(file).await.unwrap(),
    }
}
