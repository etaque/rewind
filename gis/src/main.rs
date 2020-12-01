mod environment;

use warp::Filter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // let env = environment::Environment::new().await?;

    let health_route = warp::path!("health").map(|| "Ok");

    let routes = health_route.with(warp::cors().allow_any_origin());

    warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;

    Ok(())
}
