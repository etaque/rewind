use actix::prelude::*;
use actix_web::web;
use actix_web_actors::ws;
use serde_json;
use std::time::{Duration, Instant};

use shared::messages;
use shared::models;

use crate::db;
use crate::repos::*;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct Session {
    pool: web::Data<db::Pool>,
    hb: Instant,
    state: State,
}

#[derive(Clone)]
pub enum State {
    Idle,
    Running(models::Course),
}

impl Actor for Session {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);
        log::info!("Started a session");
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for Session {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.hb = Instant::now();
            }
            Ok(ws::Message::Text(text)) => match serde_json::from_str(&text) {
                Ok(msg) => {
                    Self::handle_player_message(self.pool.clone(), self.state.clone(), msg)
                        .into_actor(self)
                        .then(|res, _, ctx| {
                            match res {
                                Ok(Some(local_msg)) => {
                                    log::debug!("Forwarding local message");
                                    ctx.notify(local_msg)
                                }
                                Ok(None) => (),
                                Err(e) => {
                                    log::error!("Failed to handle player message: {:#?}", e);
                                    ctx.stop()
                                }
                            }
                            fut::ready(())
                        })
                        .wait(ctx);
                }
                Err(e) => {
                    log::warn!("Unable to deserialize message: {:#?}", e);
                }
            },
            Ok(ws::Message::Binary(_)) => {
                log::warn!("Binary message, ignoring.");
            }
            Ok(ws::Message::Close(reason)) => {
                log::error!("Closing WS because of: {:#?}", reason);
                ctx.close(reason);
                ctx.stop();
            }
            _ => ctx.stop(),
        }
    }
}

#[derive(Debug, Clone, Message)]
#[rtype(result = "anyhow::Result<()>")]
enum LocalMessage {
    StartCourse(models::Course),
    SendToPlayer(messages::FromServer),
}

impl Handler<LocalMessage> for Session {
    type Result = anyhow::Result<()>;

    fn handle(&mut self, msg: LocalMessage, ctx: &mut Self::Context) -> Self::Result {
        match msg {
            LocalMessage::StartCourse(course) => {
                self.state = State::Running(course);
                Ok(())
            }
            LocalMessage::SendToPlayer(to_player) => {
                Ok(ctx.text(serde_json::to_string(&to_player)?))
            }
        }
    }
}

impl Session {
    pub fn new(pool: web::Data<db::Pool>) -> Self {
        Self {
            hb: Instant::now(),
            pool,
            state: State::Idle,
        }
    }

    async fn handle_player_message(
        pool: web::Data<db::Pool>,
        state: State,
        msg: messages::ToServer,
    ) -> anyhow::Result<Option<LocalMessage>> {
        log::info!("Handling message from player: {:?}", msg);
        match (msg, state) {
            (messages::ToServer::StartCourse { .. }, State::Idle) => {
                let course = shared::courses::vg20();
                Ok(Some(LocalMessage::StartCourse(course)))
            }
            (messages::ToServer::GetWind { time, position }, State::Running(_)) => {
                let conn = pool.get().await?;
                let report = wind_reports::find_closest(&conn, &time).await?;
                // let all = wind_points::by_report_id(&conn, report.id)
                //     .await?
                //     .into_iter()
                //     .map(crate::models::WindPoint::into)
                //     .collect();
                let empty_wind = models::WindPoint {
                    position: position.clone(),
                    u: 0.0,
                    v: 0.0,
                };
                let point = postgis::ewkb::Point::new(position.lng, position.lat, None);
                let wind = wind_points::at(&conn, report.id, &point)
                    .await?
                    .map(|wp| wp.into())
                    .unwrap_or(empty_wind);
                Ok(Some(LocalMessage::SendToPlayer(
                    messages::FromServer::SendWind(models::WindReport {
                        time: report.target_time,
                        wind,
                    }),
                )))
            }
            (msg, _) => {
                log::warn!("Unexpected player message: {:?}", &msg);
                Ok(None)
            }
        }
    }

    fn hb(&self, ctx: &mut <Self as Actor>::Context) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                println!("Websocket Client heartbeat failed, disconnecting!");

                ctx.stop();

                return;
            }

            ctx.ping(b"");
        });
    }
}
