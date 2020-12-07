use super::race::Race;
use crate::models::Course;
use actix::prelude::*;
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub enum Msg {
    CreateRace(Course),
}

#[derive(Default)]
pub struct Server {
    races: HashMap<Uuid, Race>,
}

impl Actor for Server {
    type Context = Context<Self>;

    // fn started(&mut self, ctx: &mut Self::Context) {
    // }
}

impl Handler<Msg> for Server {
    type Result = ();

    fn handle(&mut self, msg: Msg, ctx: &mut Context<Self>) {
        match msg {
            Msg::CreateRace(course) => {
                // let race = Race {
                //     id: Uuid::new_v4(),
                //     clock: Instant::now(),
                //     course,
                //     players: HashMap::new(),
                // };
            }
        }
    }
}
