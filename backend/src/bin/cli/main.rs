mod grib;
mod migrate;
mod reset;

use clap::{App, SubCommand};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let matches = App::new("Rewind CLI")
        .subcommand(grib::cli())
        .subcommand(SubCommand::with_name("reset"))
        .subcommand(SubCommand::with_name("migrate"))
        .get_matches();

    match matches.subcommand_name() {
        Some("grib") => grib::exec(matches.subcommand_matches("grib").unwrap()).await?,
        Some("reset") => reset::exec()?,
        Some("migrate") => migrate::exec().await?,
        _ => panic!("Subcommand expected!"),
    }

    Ok(())
}
