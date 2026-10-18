import "../../../assets/js/page-views.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";
import "./brownstone.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element.");
const root = createRoot(container);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("studio")) {
  void import("./dev/Studio").then(({ Studio }) => root.render(<Studio />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
