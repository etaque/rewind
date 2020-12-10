#![allow(clippy::wildcard_imports)]

use seed::{prelude::*, *};
use std::rc::Rc;

const WS_URL: &str = "ws://127.0.0.1:3000/game";

fn init(_: Url, orders: &mut impl Orders<Msg>) -> Model {
    Model {
        counter: 0,
        web_socket: create_websocket(orders),
        web_socket_reconnector: None,
    }
}

fn create_websocket(orders: &impl Orders<Msg>) -> WebSocket {
    let msg_sender = orders.msg_sender();

    WebSocket::builder(WS_URL, orders)
        .on_open(|| Msg::WebSocketOpened)
        .on_message(move |msg| decode_message(msg, msg_sender))
        .on_close(Msg::WebSocketClosed)
        .on_error(|| Msg::WebSocketFailed)
        .build_and_open()
        .unwrap()
}

struct Model {
    counter: i32,
    web_socket: WebSocket,
    web_socket_reconnector: Option<StreamHandle>,
}

enum Msg {
    Increment,
    WebSocketOpened,
    TextMessageReceived(shared::ToPlayer),
    BinaryMessageReceived(shared::ToPlayer),
    CloseWebSocket,
    WebSocketClosed(CloseEvent),
    WebSocketFailed,
    ReconnectWebSocket(usize),
}

fn update(msg: Msg, mut model: &mut Model, orders: &mut impl Orders<Msg>) {
    match msg {
        Msg::Increment => model.counter += 1,
        Msg::WebSocketOpened => {
            model.web_socket_reconnector = None;
            log!("WebSocket connection is open now");
        }
        Msg::TextMessageReceived(message) => {
            log!("Client received a text message: {}", message);
            // model.messages.push(message.text);
        }
        Msg::BinaryMessageReceived(message) => {
            log!("Client received binary message: {}", message);
            // model.messages.push(message.text);
        }
        Msg::CloseWebSocket => {
            model.web_socket_reconnector = None;
            model
                .web_socket
                .close(None, Some("user clicked Close button"))
                .unwrap();
        }
        Msg::WebSocketClosed(close_event) => {
            log!("==================");
            log!("WebSocket connection was closed:");
            log!("Clean:", close_event.was_clean());
            log!("Code:", close_event.code());
            log!("Reason:", close_event.reason());
            log!("==================");

            // Chrome doesn't invoke `on_error` when the connection is lost.
            if !close_event.was_clean() && model.web_socket_reconnector.is_none() {
                model.web_socket_reconnector = Some(
                    orders.stream_with_handle(streams::backoff(None, Msg::ReconnectWebSocket)),
                );
            }
        }
        Msg::WebSocketFailed => {
            log!("WebSocket failed");
            if model.web_socket_reconnector.is_none() {
                model.web_socket_reconnector = Some(
                    orders.stream_with_handle(streams::backoff(None, Msg::ReconnectWebSocket)),
                );
            }
        }
        Msg::ReconnectWebSocket(retries) => {
            log!("Reconnect attempt:", retries);
            model.web_socket = create_websocket(orders);
        }
    }
}

fn decode_message(message: WebSocketMessage, msg_sender: Rc<dyn Fn(Option<Msg>)>) {
    if message.contains_text() {
        let msg = message
            .json::<shared::ToPlayer>()
            .expect("Failed to decode WebSocket text message");

        msg_sender(Some(Msg::TextMessageReceived(msg)));
    } else {
        spawn_local(async move {
            let bytes = message
                .bytes()
                .await
                .expect("WebsocketError on binary data");

            let msg: shared::ToPlayer = rmp_serde::from_slice(&bytes).unwrap();
            msg_sender(Some(Msg::BinaryMessageReceived(msg)));
        });
    }
}

fn view(model: &Model) -> Node<Msg> {
    div![
        "This is a cool counter: ",
        C!["counter"],
        button![model.counter, ev(Ev::Click, |_| Msg::Increment),],
    ]
}

#[wasm_bindgen(start)]
pub fn start() {
    App::start("app", init, update, view);
}
