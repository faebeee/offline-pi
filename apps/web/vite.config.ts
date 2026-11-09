import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** core in development (npm run dev:core); it serves the API and the passthrough. */
const core = process.env.CORE_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [
    // file-based routes: src/routes/** -> src/routeTree.gen.ts
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  // served by core at the site root; client-side routes (/maps/, /mesh/...)
  base: "/",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: core },
      "/svc": { target: core, ws: true },
      "/ui": { target: core },
      "/socket.io": { target: core, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
