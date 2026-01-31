use std::path::PathBuf;

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
    PullGribs {
        #[arg(default_value = "2020-01-01")]
        from: NaiveDate,
        #[arg(long)]
        to: Option<NaiveDate>,
        #[arg(short, long, default_value_t = 2)]
        concurrency: usize,
    },
    RebuildDb {
        #[arg(short, long, default_value_t = false)]
        truncate: bool,
    },
    DumpCourses {
        #[arg(long)]
        file: Option<PathBuf>,
    },
    RestoreCourses {
        file: PathBuf,
    },
}
