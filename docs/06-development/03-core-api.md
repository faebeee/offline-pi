# Core API

Core is a domain-driven NestJS app. Every feature is one domain module with
its routes under `/api/<name>/`, and the web app's client is generated from
the OpenAPI document the domains produce. This page explains the parts; the
step-by-step version is [Adding a feature](06-adding-a-feature.md).

## A domain's folder

```text
apps/core/src/domains/<name>/
  <name>.module.ts      # Nest module, imported in src/app.module.ts
  api/                  # <name>.controller.ts: routes under /api/<name>/
  application/          # use cases with logic (may combine domains)
  infrastructure/       # <name>.client.ts: talks to the container, mappers
  domain/               # <name>.dto.ts: the domain's model = the API contract
  <name>.events.ts      # Socket.IO namespace /<name> (optional)
```

| Folder | Put here | Example |
|---|---|---|
| `api/` | Controllers only: routes, parameters, headers | `maps.controller.ts` |
| `application/` | Logic: combining calls, watching jobs, keeping state | `job-watcher.service.ts`, `mesh-feed.service.ts` |
| `infrastructure/` | The container client, mappers from the container's shapes | `mesh.client.ts`, `mesh.mappers.ts` |
| `domain/` | DTO classes: what the API accepts and returns | `mesh.dto.ts` |

Controllers may call the infrastructure client directly for 1:1 calls.
Anything with logic goes in `application/`.

## Talking to a container

`UpstreamService.client('<module id>')` returns an `UpstreamClient` for an
installed module, with the base URL from its manifest
(`http://MODULES_BIND_ADDRESS:<port>`). It has `get`, `post`, `patch`,
`delete`, `text` (HTML or XML), a raw `fetch` (for streams) and `wsUrl`.

It maps failures to the errors the web app expects:

| Situation | Result |
|---|---|
| Module not installed | `404`, "... is not installed: run ./install.sh." |
| Container not reachable (stopped) | `503`, "... is not running. Start it on the home page." with `Retry-After` |
| No answer in 15 seconds | `504` |
| Container answers `4xx`/`5xx` | Same status, the container's message |

A typical client in `infrastructure/`:

```ts
@Injectable()
export class MapsClient {
  constructor(private readonly upstream: UpstreamService) {}

  private get c(): UpstreamClient {
    return this.upstream.client('maps');
  }

  regions() {
    return this.c.get<RegionsResponse>('/api/regions');
  }
}
```

Get the client on each call (as above), not once in the constructor:
`client()` throws the `404` when the module is not installed, and that must
reach the request, not break core's start.

## The contract: DTO classes

- Request and response types are **classes** in `*.dto.ts` files. The
  `@nestjs/swagger` CLI plugin (`apps/core/nest-cli.json`) reads them, the
  controllers' return types and their doc comments, and turns them into the
  OpenAPI document. Interfaces are invisible to the plugin, so never use one
  for an API type.
- Request DTOs need `class-validator` decorators. The global
  `ValidationPipe` runs with `whitelist`, so undecorated fields are dropped.
- Map the container's shapes to the domain model in `infrastructure/`, for
  example mesh's snake_case to camelCase.
- Doc comments (`/** ... */`) on controller methods and DTO fields become the
  descriptions in Swagger and in the generated client.

## Operation ids

The operation id of a route is `<controller without "Controller"><Method>`:

| Controller method | Operation id | Generated hook |
|---|---|---|
| `MapsController.regions` | `mapsRegions` | `useMapsRegions()` |
| `MeshController.send` | `meshSend` | `useMeshSend()` |

So name controller methods for the client: short verbs or nouns that read
well after the domain name.

## Live events

A domain that pushes updates has a gateway in `<name>.events.ts`:

```ts
registerEventModels(Job);

@WebSocketGateway(socketOptions('/maps'))
export class MapsEvents {
  @WebSocketServer()
  nsp!: Namespace;
  // emit with this.nsp.emit('job', job) or to a room
}
```

- `socketOptions('/<name>')` puts the namespace on core's one Socket.IO
  server.
- `registerEventModels(...)` adds the payload classes to the OpenAPI
  document, so they are generated into the client's models.
- Add the events to `packages/api-client/src/events.ts` by hand (OpenAPI has
  no events), under the namespace, with the server and client events.

## Using another domain

A feature may combine domains: import the other domain's Nest module and
inject its exported client or service (for example `MeshModule` exports
`MeshClient`).
Never call another module's container from the browser.

## Generating the client

```bash
npm run api:gen
```

1. Builds core (`nest build`, which runs the swagger plugin).
2. Writes `packages/api-client/openapi.json` with `src/openapi-emit.ts` in
   Nest preview mode: no containers or Podman needed.
3. Runs orval (`packages/api-client/orval.config.ts`).

| Output | Content |
|---|---|
| `src/generated/<tag>/` | Per domain: fetch functions (`mapsRegions()`), query keys (`getMapsRegionsQueryKey()`), TanStack Query hooks (`useMapsRegions()`) |
| `src/generated/model/` | Every DTO, including event payloads |
| `src/fetcher.ts` | Hand-written: the one `fetch` behind every call, `ApiError` with core's message, `X-Pi-Monitor` and the control PIN on state-changing calls |

The generated files are checked in. Regenerate after every API change and
commit them with it.
