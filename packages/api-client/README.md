# @offline-pi/api-client

Everything the web app needs to talk to core, generated from core's OpenAPI
document, so an endpoint added to a domain in `apps/core` is a typed hook in
`apps/web` after one command.

```bash
npm run api:gen   # at the repo root
```

1. builds core (`nest build`; the `@nestjs/swagger` CLI plugin reads the
   `*.dto.ts` classes and controller return types),
2. writes `openapi.json` here (`apps/core/src/openapi-emit.ts`, Nest preview
   mode: no containers or Podman needed),
3. runs [orval](https://orval.dev) (`orval.config.ts`).

The output is checked in; regenerate after every API change.

| | |
|---|---|
| `src/generated/<tag>/<tag>.ts` | per domain (OpenAPI tag): fetch functions (`mapsRegions()`), query keys (`getMapsRegionsQueryKey()`), TanStack Query hooks (`useMapsRegions()`, `useMapsCreatePoi()`) |
| `src/generated/model/` | every DTO of core, including socket event payloads |
| `src/events.ts` | Socket.IO namespaces and their events, typed (hand-written: OpenAPI has no events) |
| `src/fetcher.ts` | the one `fetch` behind every call: same origin, `ApiError` with core's message, `X-Pi-Monitor` and the control PIN on state-changing calls |

Operation ids, and so the names, are `<controller><Method>`:
`MeshController.send` -> `meshSend()` / `useMeshSend()`.
