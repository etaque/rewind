use clap::Parser;
use cli::{Cli, Command};

mod cli;
mod db;
mod messages;
mod models;
mod repos;
mod server;
mod tools;

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
        Command::Grib(grib_args) => {
            tools::grib::exec(&args.database_url, grib_args)
                .await
                .unwrap();
        }
    }
}
