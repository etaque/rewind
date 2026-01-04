use clap::Parser;
use cli::{Cli, Command};

mod cli;
mod db;
mod grib_store;
mod messages;
mod models;
mod multiplayer;
mod repos;
mod server;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    env_logger::init();

    let args = Cli::parse();

    match args.cmd {
        Command::Http {
            address,
            client_url,
        } => server::run(address, &client_url, &args.database_url).await,
        Command::Db(db_cmd) => match db_cmd.cmd {
            cli::DbSubCommand::Migrate => {
                db::migrate(&args.database_url).await.unwrap();
            }
            cli::DbSubCommand::Reset => {
                db::reset(&args.database_url).await.unwrap();
            }
        },
        Command::ImportGribRange(range_args) => {
            grib_store::import_grib_range(&args.database_url, range_args)
                .await
                .unwrap();
        }
    }
}
