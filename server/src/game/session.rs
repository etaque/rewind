use actix::prelude::*;
use actix_web::web;
use actix_web_actors::ws;
use chrono::{DateTime, Utc};
use log::{error, info, warn};
use serde_json;
use std::time::{Duration, Instant};

use shared::*;

use crate::db;
use crate::repos::wind_reports;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct Session {
    pool: web::Data<db::Pool>,
    hb: Instant,
    course: Course,
}

impl Actor for Session {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);
        info!("Started a session");
        ctx.text(serde_json::to_string(&ToPlayer::CourseInit(self.course.clone())).unwrap());
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
                    Session::handle_from_player(self.pool.clone(), self.course.clone(), msg)
                        .into_actor(self)
                        .map(|result, _act, _ctx| match result {
                            Ok(to_player) => {
                                _ctx.text(serde_json::to_string(&to_player).unwrap());
                            }
                            _ => {
                                error!("TODO Actor error");
                            }
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

impl Session {
    pub fn new(pool: web::Data<db::Pool>, course: Course) -> Self {
        Self {
            hb: Instant::now(),
            pool,
            course,
        }
    }

    async fn handle_from_player(
        pool: web::Data<db::Pool>,
        course: Course,
        msg: FromPlayer,
    ) -> anyhow::Result<ToPlayer> {
        match msg {
            FromPlayer::RunUpdate(state) => {
                let at = Self::real_time(course, state.clock);

                let conn = pool.get().await?;
                let report = wind_reports::find_closest(conn, at).await?;
                Ok(ToPlayer::WindUpdate(WindState {
                    time: report.target_time,
                    points: Vec::new(),
                }))
            }
        }
    }

    pub fn real_time(course: Course, clock: i64) -> DateTime<Utc> {
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
