use refinery::config::Config;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("migrations");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut conf = Config::from_env_var("DATABASE_URL")?;
    println!("Running migrations");
    embedded::migrations::runner().run(&mut conf)?;
    Ok(())
}
