import { defineConfig } from "vite";

// A static page: relative asset paths, so dist/ works from any folder or
// sub path (e.g. GitHub Pages at /<repo>/).
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
