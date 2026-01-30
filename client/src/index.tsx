import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import App from "./app/App";
import CourseEditorPage from "./app/course-editor/CourseEditorPage";

import "./styles.css";

function Root() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  console.log(route);

  if (route === "#/editor") {
    return <CourseEditorPage />;
  }

  return <App />;
}

const root = createRoot(document.getElementById("app")!);
root.render(<Root />);
