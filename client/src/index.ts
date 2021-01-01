import { startApp } from "./app";
import { SphereView } from "./sphere";

import Wind from "./wind";

import "./styles.css";

const appNode = document.getElementById("app")!;
const sphereNode = document.getElementById("sphere")!;

const serverUrl = process.env.REWIND_SERVER_URL!;

const app = startApp(appNode, { serverUrl });

let currentWind: Wind;
let view: SphereView;

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      view = new SphereView(sphereNode, request.course);
      return;

    case "GetWindAt":
      if (currentWind) {
        app.ports.responses.send({
          tag: "WindIs",
          windSpeed: currentWind.speedAt(request.position) ?? {
            u: 0,
            v: 0,
          },
        });
      }
      return;

    case "MoveTo":
      if (view) {
        view.updatePosition(request.position);
      }
      return;

    case "LoadReport":
      Wind.load(request.windReport.id, "uv").then((wind) => {
        currentWind = wind;
        if (view) {
          view.updateWind(wind);
        }
      });
      return;
  }
});
