use super::db;
use super::messages::{self, FromServer, ToServer};
use super::repos::{wind_rasters, wind_reports};
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
                let (u, v) =
                    wind_rasters::wind_at_point(&conn, &report.raster_id, &position.clone().into())
                        .await?;
                let wind = messages::WindPoint { position, u, v };
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
