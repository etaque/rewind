import { createRoot } from "react-dom/client";
import App from "./app/App";

import "./styles.css";

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
