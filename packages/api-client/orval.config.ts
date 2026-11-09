import { defineConfig } from "orval";

/**
 * openapi.json is written by core (`npm run api:gen` at the repo root): every
 * endpoint of every domain becomes a typed fetch function and a TanStack
 * Query hook (useSystemSnapshot, useMapsRegions, ...) in src/generated/.
 */
export default defineConfig({
  core: {
    input: { target: "./openapi.json" },
    output: {
      mode: "tags-split",
      target: "./src/generated/endpoints.ts",
      schemas: "./src/generated/model",
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      override: {
        mutator: { path: "./src/fetcher.ts", name: "apiFetch" },
        fetch: { includeHttpResponseReturnType: false },
        // GET -> useQuery hooks, POST/PATCH/DELETE -> useMutation hooks
        query: { signal: true },
      },
    },
  },
});
