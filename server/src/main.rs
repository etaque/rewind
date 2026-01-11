use clap::Parser;
use cli::{Cli, Command};

mod cli;
mod config;
mod courses;
mod grib_png;
mod grib_store;
mod manifest;
mod multiplayer;
mod s3;
mod server;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    env_logger::init();

    let args = Cli::parse();

    match args.cmd {
        Command::Http { address } => server::run(address).await,
        Command::ImportGribRange(range_args) => {
            grib_store::import_grib_range(range_args).await.unwrap();
        }
        Command::RebuildManifest => {
            let manifest = manifest::Manifest::rebuild_from_s3().await.unwrap();
            manifest.save().await.unwrap();
            println!("Manifest saved.");
        }
    }
}
