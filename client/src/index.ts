import "./styles.css";

import * as globe from "./globe";

globe.init("map");

(async () => {
  await import("../pkg/index");
})();
