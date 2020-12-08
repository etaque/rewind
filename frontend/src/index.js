import Elm from './App.elm'
import './style.css'

const root = document.getElementById('app')
const app = Elm.App.init({ node: root })

const socket = new WebSocket('ws://127.0.0.1:3030/game');

// Connection opened
socket.addEventListener('open', function (event) {
    socket.send(JSON.stringify({
        clock: 0, 
        position: { lon: 46.470243284275966, lat: 46.470243284275966 },
        viewport: { min: { lon: 0, lat: 0}, max: {lon: 1, lat: 1}}
    }));
});

// Listen for messages
socket.addEventListener('message', function (event) {
    console.log('Message from server ', event.data);
});
