import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setWorkerUrl } from "maplibre-gl";
// maplibre-gl v6 loads its worker from a separate file. Importing it as a URL
// makes Vite emit it as a local asset, so nothing is fetched from a CDN.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
// Order matters: MapLibre's defaults first, so the Outpost package (a synced
// copy of /ui, see README) can restyle its controls, then app layout.
import "maplibre-gl/dist/maplibre-gl.css";
import "@offline-pi/ui/outpost.css";
import { initTheme } from "@offline-pi/ui/outpost.js";
import { App } from "./App";
import "./styles.css";

// Before the first paint, so a stored day theme does not flash dark.
initTheme();
setWorkerUrl(workerUrl);

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
