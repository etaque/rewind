#![allow(clippy::wildcard_imports)]

use seed::{prelude::*, *};
use std::rc::Rc;

use shared::messages::*;
use shared::models::*;

const WS_URL: &str = "ws://127.0.0.1:3000/session";

struct Model {
    state: State,
    web_socket: WebSocket,
    web_socket_reconnector: Option<StreamHandle>,
}

#[derive(Clone)]
enum State {
    Root,
    Opening(Course),
    Playing(Session),
}

#[derive(Clone)]
struct Session {
    state: PlayerState,
    course: Course,
    wind: WindState,
}

enum Msg {
    Open(Course),
    WsMsg(WsMsg),
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
    Model {
        state: State::Root,
        web_socket: create_websocket(orders),
        web_socket_reconnector: None,
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
        Msg::Open(course) => {
            let msg = ToServer::SelectCourse(course.key.clone());
            model.web_socket.send_json(&msg).unwrap();
            model.state = State::Opening(course.clone());
        }
        Msg::WsMsg(ws_msg) => {
            let reconnect = |i| Msg::WsMsg(WsMsg::ReconnectWebSocket(i));
            match ws_msg {
                WsMsg::WebSocketOpened => {
                    model.web_socket_reconnector = None;
                    let msg = ToServer::UpdateRun(PlayerState {
                        clock: 0,
                        position: LngLat(46.470243284275966, 46.470243284275966),
                        viewport: LngLatBounds {
                            sw: LngLat(0.0, 0.0),
                            ne: LngLat(1.0, 1.0),
                        },
                    });
                    model.web_socket.send_json(&msg).unwrap();
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
        (FromServer::InitCourse(course, wind), _) => {
            let state = PlayerState {
                clock: 0,
                position: course.start.clone(),
                viewport: LngLatBounds {
                    sw: LngLat(0.0, 0.0),
                    ne: LngLat(1.0, 1.0),
                },
            };
            let session = Session {
                state,
                course,
                wind,
            };
            model.state = State::Playing(session);
        }
        (FromServer::RefreshWind(wind), State::Playing(session)) => {
            let new_session = Session { wind, ..session };
            model.state = State::Playing(new_session);
        }
        (FromServer::Unexpected(_), _) => error!("Ooops, sent an unexpected message to server..."),
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
        State::Root => button![
            "Start!",
            ev(Ev::Click, |_| Msg::Open(shared::courses::vg20())),
        ],
        State::Opening(_course) => div!("Opening a course..."),
        State::Playing(_session) => custom![
            Tag::from("mapbox-gl"),
            attrs! {
            At::from("foo") => "bar"
            }
        ],
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    App::start("app", init, update, view);
}
