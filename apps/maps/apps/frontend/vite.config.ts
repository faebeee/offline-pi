import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

// Everything the map loads is proxied to the backend, so the dev server behaves
// exactly like the production single-origin setup.
const proxied = ["/api", "/tiles", "/pmtiles", "/fonts", "/sprites"];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: backend, changeOrigin: false }]),
    ),
  },
  build: {
    // Built app is served by the backend in production.
    outDir: "../backend/public",
    emptyOutDir: true,
  },
});
