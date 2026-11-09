import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8081";

// Everything the map loads is proxied to the backend, so the dev server behaves
// exactly like the production single-origin setup.
const proxied = ["/api", "/tiles", "/pmtiles", "/fonts", "/sprites"];

export default defineConfig({
  plugins: [react()],
  // offline-pi serves the app under /maps/: asset URLs relative to the page
  base: "./",
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: backend, changeOrigin: false }]),
    ),
  },
  build: {
    // Served by the backend (PATHS.publicDir) in production.
    outDir: "dist",
    emptyOutDir: true,
  },
});
