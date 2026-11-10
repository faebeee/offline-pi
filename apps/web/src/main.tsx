// MapLibre's defaults first, so Outpost (outpost.css) restyles its controls
import "maplibre-gl/dist/maplibre-gl.css";
import "@outpost/ui/outpost.css";
import { initTheme } from "@outpost/ui/outpost.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// before the first paint, so a stored day theme does not flash dark
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // everything is on the LAN: retry quickly, but not forever
      retry: (count, err) => count < 2 && !(err as { status?: number }).status,
      refetchOnWindowFocus: true,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
