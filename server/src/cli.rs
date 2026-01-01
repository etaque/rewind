use chrono::NaiveDate;
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(about = "Rewind CLI.")]
pub struct Cli {
    #[arg(env = "REWIND_DATABASE_URL", short, long)]
    pub database_url: String,
    #[command(subcommand)]
    pub cmd: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Http {
        #[arg(env = "REWIND_SERVER_ADDRESS")]
        address: std::net::SocketAddr,
        #[arg(env = "REWIND_CLIENT_URL")]
        client_url: String,
    },
    Db(DbCommand),
    Grib(GribArgs),
}

#[derive(Debug, Parser)]
pub struct DbCommand {
    #[command(subcommand)]
    pub cmd: DbSubCommand,
}

#[derive(Debug, Subcommand)]
pub enum DbSubCommand {
    Reset,
    Migrate,
}

#[derive(Debug, Parser)]
pub struct GribArgs {
    #[arg(long)]
    pub url: String,
    #[arg(long)]
    pub day: NaiveDate,
    #[arg(long)]
    pub hour: i16,
    #[arg(long)]
    pub forecast: i16,
    #[arg(long)]
    pub silent: bool,
}
