import "./styles.css";
import { startApp } from "./app/App";
import { Map } from "./Map";

const mapNode = document.getElementById("map");
const deckNode = document.getElementById("deck");
const appNode = document.getElementById("app");

const wsAddress = process.env.REWIND_WS_URL!;
const tileServerAddress = process.env.REWIND_TILE_URL!;
const hereToken = process.env.HERE_API_KEY!;

if (
  mapNode instanceof HTMLCanvasElement &&
  deckNode instanceof HTMLCanvasElement &&
  appNode
) {
  const map = new Map(mapNode, deckNode, tileServerAddress, hereToken);
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
    console.log("APP OUTPUT", output);
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
