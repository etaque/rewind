#![allow(clippy::wildcard_imports)]

use chrono::{DateTime, Utc};
use seed::{prelude::*, *};
use std::rc::Rc;

use shared::messages::*;
use shared::models::*;

const WS_URL: &str = "ws://127.0.0.1:3001/session";

struct Model {
    state: State,
    web_socket: WebSocket,
    web_socket_reconnector: Option<StreamHandle>,
    _tick: StreamHandle,
}

#[derive(Clone)]
enum State {
    Idle,
    Playing(Session),
}

#[derive(Clone)]
struct Session {
    clock: i64,
    time: DateTime<Utc>,
    position: LngLat,
    course: Course,
    wind: WindReport,
}

enum Msg {
    Start(Course),
    WsMsg(WsMsg),
    Tick,
    Rendered(RenderInfo),
}

enum WsMsg {
    WebSocketOpened,
    TextMessageReceived(FromServer),
    BinaryMessageReceived(FromServer),
    WebSocketClosed(CloseEvent),
    WebSocketFailed,
    ReconnectWebSocket(usize),
}

fn init(_: Url, orders: &mut impl Orders<Msg>) -> Model {
    orders.after_next_render(Msg::Rendered);
    let _tick = orders.stream_with_handle(streams::interval(1000, || Msg::Tick));
    Model {
        state: State::Idle,
        web_socket: create_websocket(orders),
        web_socket_reconnector: None,
        _tick,
    }
}

fn create_websocket(orders: &impl Orders<Msg>) -> WebSocket {
    let msg_sender = orders.msg_sender();

    WebSocket::builder(WS_URL, orders)
        .on_open(|| Msg::WsMsg(WsMsg::WebSocketOpened))
        .on_message(move |msg| decode_message(msg, msg_sender))
        .on_close(|e| Msg::WsMsg(WsMsg::WebSocketClosed(e)))
        .on_error(|| Msg::WsMsg(WsMsg::WebSocketFailed))
        .build_and_open()
        .unwrap()
}

fn update(msg: Msg, mut model: &mut Model, orders: &mut impl Orders<Msg>) {
    match msg {
        Msg::Tick => match &model.state {
            State::Playing(session) => {
                let msg = ToServer::GetWind(session.time, session.position.clone());
                model.web_socket.send_json(&msg).unwrap();
            }
            _ => (),
        },
        Msg::Start(course) => {
            let msg = ToServer::StartCourse(course.key.clone());
            model.web_socket.send_json(&msg).unwrap();

            let wind = WindReport::initial(&course);
            let session = Session {
                clock: 0,
                time: course.start_time.clone(),
                position: course.start.clone(),
                course,
                wind,
            };
            model.state = State::Playing(session);
        }
        Msg::Rendered(info) => {
            log!(info);
        }
        Msg::WsMsg(ws_msg) => {
            let reconnect = |i| Msg::WsMsg(WsMsg::ReconnectWebSocket(i));
            match ws_msg {
                WsMsg::WebSocketOpened => {
                    model.web_socket_reconnector = None;
                    log!("WebSocket connection is open now");
                }
                WsMsg::TextMessageReceived(message) => {
                    update_from_server(message, model);
                }
                WsMsg::BinaryMessageReceived(message) => {
                    update_from_server(message, model);
                }
                WsMsg::WebSocketClosed(close_event) => {
                    log!("==================");
                    log!("WebSocket connection was closed:");
                    log!("Clean:", close_event.was_clean());
                    log!("Code:", close_event.code());
                    log!("Reason:", close_event.reason());
                    log!("==================");

                    // Chrome doesn't invoke `on_error` when the connection is lost.
                    if !close_event.was_clean() && model.web_socket_reconnector.is_none() {
                        model.web_socket_reconnector =
                            Some(orders.stream_with_handle(streams::backoff(None, reconnect)));
                    }
                }
                WsMsg::WebSocketFailed => {
                    log!("WebSocket failed");
                    if model.web_socket_reconnector.is_none() {
                        model.web_socket_reconnector =
                            Some(orders.stream_with_handle(streams::backoff(None, reconnect)));
                    }
                }
                WsMsg::ReconnectWebSocket(retries) => {
                    log!("Reconnect attempt:", retries);
                    model.web_socket = create_websocket(orders);
                }
            }
        }
    }
}

fn update_from_server(msg: FromServer, model: &mut Model) {
    match (msg, model.state.clone()) {
        (FromServer::SendWind(wind), State::Playing(session)) => {
            let new_session = Session { wind, ..session };
            model.state = State::Playing(new_session);
        }
        _ => error!("Ooops, received an unexpected message from server..."),
    }
}

fn decode_message(message: WebSocketMessage, msg_sender: Rc<dyn Fn(Option<Msg>)>) {
    if message.contains_text() {
        let msg = message
            .json::<FromServer>()
            .expect("Failed to decode WebSocket text message");

        msg_sender(Some(Msg::WsMsg(WsMsg::TextMessageReceived(msg))));
    } else {
        spawn_local(async move {
            let bytes = message
                .bytes()
                .await
                .expect("WebsocketError on binary data");

            let msg: FromServer = rmp_serde::from_slice(&bytes).unwrap();
            msg_sender(Some(Msg::WsMsg(WsMsg::BinaryMessageReceived(msg))));
        });
    }
}

fn view(model: &Model) -> Node<Msg> {
    match &model.state {
        State::Idle => div!(
            C!["fixed inset-0 flex flex-col space-y-4 items-center justify-center bg-black bg-opacity-10"],
            h1!["Re:wind", C!["logo"]],
            button![
                C!["btn-start"],
                ev(Ev::Click, |_| Msg::Start(shared::courses::vg20())),
                rewind_icon(),
            ]
        ),
        State::Playing(_session) => div!(),
    }
}

fn rewind_icon() -> Node<Msg> {
    icon("M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z")
}

fn icon(d: &str) -> Node<Msg> {
    svg![
        attrs! {
            At::ViewBox => "0 0 20 20",
            At::Fill => "currentColor",
        },
        path![attrs! {
            At::D => d
        }]
    ]
}

#[wasm_bindgen(start)]
pub fn start() {
    App::start("app", init, update, view);
}

#[wasm_bindgen]
pub struct JsLngLat(f64, f64);

#[wasm_bindgen]
extern "C" {

    #[derive(Debug)]
    pub type Globe;

    #[wasm_bindgen(constructor)]
    pub fn new() -> Globe;

    #[wasm_bindgen(method)]
    pub fn move_to(this: &Globe, lng: f64, lat: f64);
}
