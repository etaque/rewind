use cli::{Cli, Command};
use std::convert::Infallible;
use structopt::StructOpt;
use warp::Filter;

mod cli;
mod db;
mod messages;
mod models;
mod repos;
mod tools;

#[tokio::main]
async fn main() {
    env_logger::init();

    let args = Cli::from_args();

    match args.cmd {
        Command::Http { address } => {
            let pool = db::pool(&args.database_url)
                .await
                .expect(format!("Failed to connect to DB: {}", &args.database_url).as_str());

            let health_route = warp::path!("health")
                .and(with_db(pool.clone()))
                .and_then(handlers::health);

            let session_route = warp::path("session")
                .and(warp::ws())
                .and(with_db(pool.clone()))
                .map(|ws: warp::ws::Ws, pool: db::Pool| {
                    ws.on_upgrade(move |socket| session::start(socket, pool))
                });

            let routes = health_route.or(session_route).recover(handlers::rejection);

            warp::serve(routes).run(address).await
        }
        Command::Db(db_cmd) => match db_cmd {
            cli::DbCommand::Migrate => {
                db::migrate(&args.database_url).await.unwrap();
            }
            cli::DbCommand::Reset => {
                db::reset(&args.database_url).await.unwrap();
            }
        },
        Command::Grib(grib_args) => {
            tools::grib::exec(&args.database_url, grib_args)
                .await
                .unwrap();
        }
    }
}

fn with_db(db_pool: db::Pool) -> impl Filter<Extract = (db::Pool,), Error = Infallible> + Clone {
    warp::any().map(move || db_pool.clone())
}

mod handlers {
    use serde::Serialize;
    use std::convert::Infallible;
    use warp::http::StatusCode;
    use warp::{Rejection, Reply};

    use super::db;

    #[derive(Debug)]
    struct Error(anyhow::Error);
    impl warp::reject::Reject for Error {}

    pub async fn health(pool: db::Pool) -> Result<impl Reply, Rejection> {
        db::health(&pool)
            .await
            .map_err(|e| warp::reject::custom(Error(e)))
            .map(|_| StatusCode::OK)
    }

    #[derive(Serialize)]
    struct ErrorMessage {
        code: u16,
        message: String,
    }

    pub async fn rejection(err: warp::Rejection) -> Result<impl Reply, Infallible> {
        let code = StatusCode::INTERNAL_SERVER_ERROR;
        let message = "Internal server error.";

        log::error!("Error: {:?}", err);

        let json = warp::reply::json(&ErrorMessage {
            code: code.as_u16(),
            message: message.into(),
        });

        Ok(warp::reply::with_status(json, code))
    }
}

mod session {
    use super::db;
    use super::messages::{self, FromServer, ToServer};
    use super::repos::{wind_points, wind_reports};
    use futures::{FutureExt, StreamExt};
    use tokio::sync::mpsc;
    use warp::ws::{Message, WebSocket};

    pub async fn start(ws: WebSocket, pool: db::Pool) {
        let (user_ws_tx, mut user_ws_rx) = ws.split();

        let (tx, rx) = mpsc::unbounded_channel();
        tokio::task::spawn(rx.forward(user_ws_tx).map(|result| {
            if let Err(e) = result {
                log::error!("websocket send error: {}", e);
            }
        }));

        while let Some(result) = user_ws_rx.next().await {
            let msg = match result {
                Ok(msg) => msg,
                Err(e) => {
                    log::error!("websocket receive error: {}", e);
                    break;
                }
            };
            match handle_message(msg, &pool).await {
                Ok(Some(to_player)) => {
                    let encoded = serde_json::to_string(&to_player)
                        .expect("Failed to serialize message to player");

                    if let Err(_disconnected) = tx.send(Ok(Message::text(encoded))) {
                        // The tx is disconnected, our `user_disconnected` code
                        // should be happening in another task, nothing more to
                        // do here.
                    }
                }
                Ok(None) => (),
                Err(e) => {
                    log::error!("failed to handle message: {}", e);
                }
            };
        }
    }

    async fn handle_message(msg: Message, pool: &db::Pool) -> anyhow::Result<Option<FromServer>> {
        if let Ok(s) = msg.to_str() {
            let to_server = serde_json::from_str(s)?;
            log::info!("Handling player message: {:?}", to_server);
            match to_server {
                ToServer::GetWind { time, position } => {
                    let conn = pool.get().await?;
                    let report = wind_reports::find_closest(&conn, &time).await?;
                    let empty_wind = messages::WindPoint {
                        position: position.clone(),
                        u: 0.0,
                        v: 0.0,
                    };
                    let wind = wind_points::at(&conn, report.id, &position.into())
                        .await?
                        .map(|wp| wp.into())
                        .unwrap_or(empty_wind);
                    let to_player = FromServer::SendWind {
                        report: messages::WindReport {
                            id: report.id,
                            time: report.target_time,
                            wind,
                        },
                    };
                    Ok(Some(to_player))
                }
            }
        } else {
            // Not a text message, ignoring
            Ok(None)
        }
    }
}
