import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setWorkerUrl } from "maplibre-gl";
// maplibre-gl v6 loads its worker from a separate file. Importing it as a URL
// makes Vite emit it as a local asset, so nothing is fetched from a CDN.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { App } from "./App";
import "./styles.css";

setWorkerUrl(workerUrl);

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
