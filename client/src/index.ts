import "./styles.css";
import { startApp } from "./app/App";
import { HarpGlobe } from "./globe";
import { serverAddress } from "./config";

const globeNode = document.getElementById("globe");
const appNode = document.getElementById("app");

if (globeNode instanceof HTMLCanvasElement && appNode) {
  const globe = new HarpGlobe(globeNode);
  const app = startApp(appNode, {});

  var ws: WebSocket;

  const startSession = () => {
    ws = new WebSocket(`ws://${serverAddress}/session`);
    ws.onmessage = (ev: MessageEvent<any>) => {
      switch (ev.data.tag) {
        case "SendWind":
          app.ports.inputs.send(ev.data);
          break;
      }
    };
    ws.onclose = () => {
      app.ports.inputs.send({ tag: "Disconnected" });
    };
  };

  app.ports.outputs.subscribe((output) => {
    switch (output.tag) {
      case "StartSession":
        startSession();
        break;

      case "GetWind":
        ws.send(JSON.stringify(output));
        break;

      case "MoveTo":
        globe.moveTo(output.position);
        break;
    }
  });
} else {
  console.log("Failed to mount apps", globeNode, appNode);
}
