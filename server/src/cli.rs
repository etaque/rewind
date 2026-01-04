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
    },
    Db(DbCommand),
    ImportGribRange(GribRangeArgs),
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
pub struct GribRangeArgs {
    /// Base URL for GRIB files (e.g., https://grib.v-l-m.org/archives)
    #[arg(long, default_value = "https://grib.v-l-m.org/archives")]
    pub base_url: String,
    /// Start date (inclusive)
    #[arg(long)]
    pub from: NaiveDate,
    /// End date (inclusive)
    #[arg(long)]
    pub to: NaiveDate,
}
