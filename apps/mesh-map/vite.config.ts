import { defineConfig } from "vite";

// `npm run dev` serves the page on :5173 and proxies the data routes to
// `npm start` (server.mjs, default :8086), the same split as in production.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8086";

export default defineConfig({
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/pmtiles", "/fonts", "/sprites"].map((p) => [p, { target: backend }]),
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
