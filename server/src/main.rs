use actix_web::{get, middleware, web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;
use structopt::StructOpt;

use cli::{Cli, Command};

mod cli;
mod db;
mod error;
mod game;
mod models;
mod repos;
mod tools;

async fn session(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<db::Pool>,
) -> Result<HttpResponse, Error> {
    ws::start(game::session::Session::new(pool), &req, stream)
}

#[get("/health")]
async fn health(pool: web::Data<db::Pool>) -> Result<&'static str, error::Error> {
    db::health(pool).await?;
    Ok("All good")
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let args = Cli::from_args();

    match args.cmd {
        Command::Http { address } => {
            let pool = db::pool(args.database_url).await?;
            let server = HttpServer::new(move || {
                App::new()
                    .data(pool.clone())
                    .wrap(middleware::Logger::default())
                    .service(web::resource("/session").route(web::get().to(session)))
                    .service(health)
            })
            .bind(address)?
            .run()
            .await?;
            Ok(server)
        }
        Command::Db(db_cmd) => match db_cmd {
            cli::DbCommand::Migrate => db::migrate(args.database_url).await,
            cli::DbCommand::Reset => Ok(()),
        },
        Command::Grib(grib_args) => tools::grib::exec(args.database_url, grib_args).await,
    }
}
