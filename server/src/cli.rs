use chrono::NaiveDate;
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(about = "Rewind CLI.")]
pub struct Cli {
    #[command(subcommand)]
    pub cmd: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Http {
        #[arg(env = "REWIND_SERVER_ADDRESS")]
        address: std::net::SocketAddr,
    },
    ImportGribRange(GribRangeArgs),
    /// Rebuild manifest.json from S3 listing
    RebuildManifest,
}

#[derive(Debug, Parser)]
pub struct GribRangeArgs {
    /// Start date (inclusive)
    #[arg(long)]
    pub from: NaiveDate,
    /// End date (inclusive)
    #[arg(long)]
    pub to: NaiveDate,
}
