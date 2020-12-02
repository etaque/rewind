use ::rewind::environment::Environment;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("migrations");
}

pub async fn exec() -> anyhow::Result<()> {
    let env = Environment::new().await?;
    let mut conn = env.db_pool.dedicated_connection().await?;

    println!("Running migrations");
    embedded::migrations::runner().run_async(&mut conn).await?;
    Ok(())
}
