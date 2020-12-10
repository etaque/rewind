use actix::prelude::*;
use actix_web::web;
use actix_web_actors::ws;
use chrono::{DateTime, Utc};
use log::{error, info, warn};
use serde_json;
use std::time::{Duration, Instant};

use shared::messages;
use shared::models;

use crate::db;
use crate::repos::wind_reports;

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
        ctx.notify(LocalMessage::Tick);
        info!("Started a session");
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
                        .then(|res, act, ctx| {
                            match res {
                                Ok(local_msg) => ctx.notify(local_msg),
                                _ => ctx.stop(),
                            }
                            fut::ready(())
                        })
                        .wait(ctx);
                }
                Err(e) => {
                    warn!("Unable to deserialize message: {:#?}", e);
                }
            },
            Ok(ws::Message::Binary(_)) => {
                warn!("Binary message, ignoring.");
            }
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => ctx.stop(),
        }
    }
}

#[derive(Clone, Message)]
#[rtype(result = "anyhow::Result<()>")]
enum LocalMessage {
    Tick,
    SendToPlayer(messages::FromServer),
}

impl Handler<LocalMessage> for Session {
    type Result = anyhow::Result<()>;

    fn handle(&mut self, msg: LocalMessage, ctx: &mut Self::Context) -> Self::Result {
        match msg {
            LocalMessage::Tick => {
                match self.state.clone() {
                    State::Idle => {}
                    State::Running(_course) => {
                        // TODO send wind?
                    }
                };
                ctx.notify_later(LocalMessage::Tick, Duration::from_secs(1));

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
    ) -> anyhow::Result<LocalMessage> {
        match (msg, state) {
            (messages::ToServer::SelectCourse(_), State::Idle) => {
                let course = shared::courses::vg20();
                let initial_wind = models::WindState {
                    time: course.start_time,
                    points: Vec::new(),
                };
                Ok(LocalMessage::SendToPlayer(
                    messages::FromServer::InitCourse(course, initial_wind),
                ))
            }
            (messages::ToServer::UpdateRun(state), State::Running(course)) => {
                let at = Self::real_time(course, state.clock);

                let conn = pool.get().await?;
                let report = wind_reports::find_closest(conn, at).await?;
                Ok(LocalMessage::SendToPlayer(
                    messages::FromServer::RefreshWind(models::WindState {
                        time: report.target_time,
                        points: Vec::new(),
                    }),
                ))
            }
            (msg, _) => Ok(LocalMessage::SendToPlayer(
                messages::FromServer::Unexpected(msg.clone()),
            )),
        }
    }

    pub fn real_time(course: models::Course, clock: i64) -> DateTime<Utc> {
        course.start_time + chrono::Duration::milliseconds(clock) * course.time_factor.into()
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
