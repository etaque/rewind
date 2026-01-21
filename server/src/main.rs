use clap::Parser;
use cli::{Cli, Command, DataSource};

mod cli;
mod config;
mod courses;
mod db;
mod grib_png;
mod grib_store;
mod grib_stream;
mod multiplayer;
mod ncar_source;
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
        Command::ImportGribRange(range_args) => {
            grib_store::import_grib_range(range_args).await.unwrap();
        }
        Command::ImportCoursesGribs => {
            // Default to VLM source for backwards compatibility
            grib_store::import_courses_gribs(DataSource::Vlm)
                .await
                .unwrap();
        }
        Command::RebuildManifest => {
            wind_reports::rebuild_from_s3().await.unwrap();
            println!("Database rebuilt from S3.");
        }
    }
}
