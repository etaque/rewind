mod conf;
mod db;
mod game;
mod models;
mod stores;

use actix_web::{middleware, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use dotenv::dotenv;

async fn session(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<db::Pool>,
) -> Result<HttpResponse, Error> {
    ws::start(
        game::session::Session::new(pool, models::Course::vg20()),
        &req,
        stream,
    )
}

async fn health() -> impl Responder {
    "Ok"
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();

    std::env::set_var("RUST_LOG", "actix_server=info,actix_web=info");
    env_logger::init();

    let conf = conf::Conf::from_env().unwrap();
    let pool = web::Data::new(db::pool(conf).await.unwrap());

    HttpServer::new(move || {
        App::new()
            .data(pool.clone())
            .wrap(middleware::Logger::default())
            .service(web::resource("/game").route(web::get().to(session)))
            .service(web::scope("/app").route("/health", web::get().to(health)))
    })
    .bind("127.0.0.1:3030")?
    .run()
    .await
}
