use chrono::NaiveDate;
use structopt::StructOpt;

#[derive(Debug, StructOpt)]
#[structopt(about = "Rewind CLI.")]
pub struct Cli {
    #[structopt(env = "REWIND_DATABASE_URL", short, long)]
    pub database_url: String,
    #[structopt(subcommand)]
    pub cmd: Command,
}

#[derive(Debug, StructOpt)]
pub enum Command {
    Http {
        #[structopt(env = "REWIND_SERVER_ADDRESS")]
        address: std::net::SocketAddr,
        #[structopt(env = "REWIND_CLIENT_URL")]
        client_url: String,
    },
    Db(DbCommand),
    Grib(GribArgs),
}

#[derive(Debug, StructOpt)]
pub enum DbCommand {
    Reset,
    Migrate,
}

#[derive(Debug, StructOpt)]
pub struct GribArgs {
    #[structopt(long)]
    pub url: String,
    #[structopt(long)]
    pub day: NaiveDate,
    #[structopt(long)]
    pub hour: i16,
    #[structopt(long)]
    pub forecast: i16,
    #[structopt(long)]
    pub silent: bool,
}
