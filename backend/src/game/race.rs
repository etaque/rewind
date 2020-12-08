use actix::prelude::*;
use actix_web::web;

use super::messages::{RunUpdate, WindState, WindUpdate};
use crate::db;
use crate::models::*;
use crate::repos::wind_reports;

pub struct Race {
    pub pool: web::Data<db::Pool>,
    pub clock: i64,
    pub course: Course,
}

impl Actor for Race {
    type Context = Context<Race>;
}

impl Handler<RunUpdate> for Race {
    type Result = ResponseFuture<anyhow::Result<WindUpdate>>;

    fn handle(&mut self, msg: RunUpdate, _ctx: &mut Context<Self>) -> Self::Result {
        let RunUpdate(player_state) = msg;
        let real_time = self.course.real_time(player_state.clock);

        let local_pool = self.pool.clone();

        let wu_fu = async move {
            let conn = local_pool.get().await?;
            let report = wind_reports::find_closest(conn, real_time).await?;
            Ok(WindUpdate(WindState {
                time: report.target_time,
                points: Vec::new(),
            }))
        };
        Box::pin(wu_fu)
    }
}
