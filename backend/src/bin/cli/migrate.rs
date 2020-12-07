use ::rewind::conf::Conf;
use ::rewind::db;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("migrations");
}

pub async fn exec() -> anyhow::Result<()> {
    let conf = Conf::from_env()?;
    let mut conn = db::pool(conf).await?.dedicated_connection().await?;

    println!("Running migrations");
    embedded::migrations::runner().run_async(&mut conn).await?;
    Ok(())
}
