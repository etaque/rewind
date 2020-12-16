import "./styles.css";
import { startApp } from "./app/App";
import { Map } from "./Map";
import { tileServerAddress, wsAddress } from "./config";

const mapNode = document.getElementById("map");
const appNode = document.getElementById("app");

if (mapNode instanceof HTMLCanvasElement && appNode) {
  const map = new Map(mapNode, tileServerAddress);
  const app = startApp(appNode, {});

  var ws: WebSocket;

  const startSession = () => {
    ws = new WebSocket(wsAddress + "/session");
    ws.onmessage = (ev: MessageEvent) => {
      app.ports.inputs.send(JSON.parse(ev.data));
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
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(output));
        break;

      case "UpdateMap":
        switch (output.updateMap.tag) {
          case "MoveTo":
            map.moveTo(output.updateMap.position);
            break;

          case "SetWind":
            map.setWindReport(output.updateMap.report);
            break;
        }
        break;
    }
  });
} else {
  console.log("Failed to mount apps", mapNode, appNode);
}
