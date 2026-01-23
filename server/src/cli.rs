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
    /// One stop command to sync everything (download missing GRIB files, sync DB with S3 content)
    Sync {
        /// Start date (inclusive)
        #[arg(default_value = "2020-01-01")]
        from: NaiveDate,
        #[arg(long)]
        /// End date (inclusive)
        to: Option<NaiveDate>,
        #[arg(short, long, default_value_t = 2)]
        concurrency: usize,
        #[arg(long, default_value_t = false)]
        /// Pull existing GRIB files from S3
        pull_s3: bool,
    },
}
