mod grib;

use clap::App;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let matches = App::new("Rewind CLI").subcommand(grib::cli()).get_matches();

    match matches.subcommand_name() {
        Some("grib") => grib::exec(matches.subcommand_matches("grib").unwrap()).await?,
        _ => panic!("Subcommand expected!"),
    }

    Ok(())
}
