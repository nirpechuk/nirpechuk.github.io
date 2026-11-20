import "../../../assets/js/page-views.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { migrateOldDomain } from "./backend/auto-migration";
import "./styles.css";
import "./brownstone.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element.");
const root = createRoot(container);
if (import.meta.env.DEV && new URLSearchParams(location.search).has("streetStudio")) {
  void import("./dev/StreetStudio").then(({ StreetStudio }) => root.render(<StreetStudio />));
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has("studio")) {
  void import("./dev/Studio").then(({ Studio }) => root.render(<Studio />));
} else {
  container.textContent = "Opening your home…";
  void migrateOldDomain().then(ready => { if (ready) root.render(
    <StrictMode>
      <App />
    </StrictMode>
  ); }).catch(error => {
    container.textContent = error instanceof Error ? error.message : "Your room couldn't reconnect.";
    const retry = document.createElement("button");
    retry.textContent = "Try reconnecting again";
    retry.onclick = () => { localStorage.removeItem("flats:domain-migration:v1"); location.replace("/flats/"); };
    container.appendChild(retry);
  });
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
