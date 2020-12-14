import "./styles.css";
import { startApplication } from "./ElmApp";
import { Globe } from "./globe";
import { serverAddress } from "./config";

const globeNode = document.getElementById("globe");
const appNode = document.getElementById("app");

if (globeNode instanceof HTMLCanvasElement && appNode) {
  new Globe(globeNode);
  const app = startApplication(appNode, { serverAddress });

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
          case "StartCourse":
            ws.send(JSON.stringify(output));
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
  console.log("Failed to mount apps, invalid nodes...", globeNode, appNode);
}
