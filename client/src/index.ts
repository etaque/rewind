import "./styles.css";
import { startApplication } from "./ElmApp";
import { Globe } from "./globe";
import { serverAddress } from "./config";

const globeNode = document.getElementById("globe");
const appNode = document.getElementById("app");

if (globeNode instanceof HTMLCanvasElement && appNode) {
  const ws = new WebSocket(`ws://${serverAddress}/session`);

  const globe = new Globe(globeNode);
  const app = startApplication(appNode, { serverAddress });

  ws.onmessage = (ev: MessageEvent<any>) => {
    console.log("onmessage", ev.data);
    switch (ev.data.tag) {
      case "SendWind":
        app.ports.inputs.send(ev.data);
    }
  };

  ws.onopen = (_: Event) => {
    app.ports.outputs.subscribe((output) => {
      console.log("output", output);
      switch (output.tag) {
        case "GetWind":
        case "StartCourse":
          ws.send(JSON.stringify(output));
      }
    });
  };
} else {
  console.log("Failed to mount apps, invalid nodes...", globeNode, appNode);
}
