use cli::{Cli, Command};
use dotenv::dotenv;
use structopt::StructOpt;

mod cli;
mod db;
mod messages;
mod models;
mod repos;
mod server;
mod session;
mod tools;

#[tokio::main]
async fn main() {
    dotenv().ok();
    env_logger::init();

    let args = Cli::from_args();

    match args.cmd {
        Command::Http { address } => server::run(address, &args.database_url).await,
        Command::Db(db_cmd) => match db_cmd {
            cli::DbCommand::Migrate => {
                db::migrate(&args.database_url).await.unwrap();
            }
            cli::DbCommand::Reset => {
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
