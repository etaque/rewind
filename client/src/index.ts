import "./styles.css";
import { startApplication } from "./ElmApp";
import { HarpGlobe } from "./globe";
import { serverAddress } from "./config";

const globeNode = document.getElementById("globe");
const appNode = document.getElementById("app");

if (globeNode instanceof HTMLCanvasElement && appNode) {
  const globe = new HarpGlobe(globeNode);
  const app = startApplication(appNode, {});

  var ws: WebSocket;

  const connect = () => {
    ws = new WebSocket(`ws://${serverAddress}/session`);

    ws.onmessage = (ev: MessageEvent<any>) => {
      switch (ev.data.tag) {
        case "SendWind":
          app.ports.inputs.send(ev.data);
          break;
      }
    };

    ws.onopen = (_: Event) => {
      app.ports.outputs.subscribe((output) => {
        switch (output.tag) {
          case "GetWind":
            ws.send(JSON.stringify(output));
            break;
          case "MoveTo":
            globe.moveTo(output.position);
            break;
        }
      });
    };

    ws.onclose = () => {
      app.ports.inputs.send({ tag: "Disconnected" });

      setTimeout(connect, 1000);
    };
  };

  connect();
} else {
  console.log("Failed to mount apps", globeNode, appNode);
}
