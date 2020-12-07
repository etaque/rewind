mod cli;
mod db;
mod game;
mod models;
mod stores;
mod tools;

use actix_web::{middleware, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use structopt::StructOpt;

use cli::{Cli, Command};

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
async fn main() -> anyhow::Result<()> {
    std::env::set_var("RUST_LOG", "actix_server=info,actix_web=info");
    env_logger::init();

    let args = Cli::from_args();

    match args.cmd {
        Command::Server { address } => {
            let pool = web::Data::new(db::pool(args.database_url).await.unwrap());
            let server = HttpServer::new(move || {
                App::new()
                    .data(pool.clone())
                    .wrap(middleware::Logger::default())
                    .service(web::resource("/game").route(web::get().to(session)))
                    .service(web::scope("/app").route("/health", web::get().to(health)))
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
