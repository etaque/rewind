use chrono::NaiveDate;
use structopt::StructOpt;

#[derive(Debug, StructOpt)]
#[structopt(about = "Rewind CLI.")]
pub struct Cli {
    #[structopt(env = "REWIND_DATABASE_URL")]
    pub database_url: String,
    #[structopt(subcommand)]
    pub cmd: Command,
}

#[derive(Debug, StructOpt)]
pub enum Command {
    Http {
        #[structopt(default_value = "127.0.0.1:3000")]
        address: String,
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
    pub url: String,
    pub day: NaiveDate,
    pub hour: i16,
    pub forecast: i16,
}
