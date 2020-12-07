use actix::prelude::*;
use actix_web::web;

use super::msg::{RunUpdate, WindState, WindUpdate};
use crate::db;
use crate::models::*;
use crate::stores::wind_reports;

pub struct Race {
    pub pool: web::Data<db::Pool>,
    pub clock: i64,
    pub course: Course,
}

impl Actor for Race {
    type Context = Context<Race>;
}

impl Handler<RunUpdate> for Race {
    type Result = ResponseFuture<WindUpdate>;

    fn handle(&mut self, msg: RunUpdate, _ctx: &mut Context<Self>) -> Self::Result {
        let RunUpdate(player_state) = msg;
        let real_time = self.course.real_time(player_state.clock);

        let local_pool = self.pool.clone();

        let wu_fu = async move {
            let conn = local_pool.get().await.unwrap();
            let report = wind_reports::find_closest(conn, real_time)
                .await
                .unwrap()
                .unwrap();
            WindUpdate(WindState {
                report,
                points: Vec::new(),
            })
        };
        Box::pin(wu_fu)
    }
}
