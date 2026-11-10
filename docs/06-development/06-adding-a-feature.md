# Adding a feature

A feature goes from an endpoint in core to a screen in the web app in three
steps. This page walks through them with a small example: a summary of the
mesh, "how many nodes were heard in the last hour", shown on the Mesh
screen.

The example is made up for this page; the files and names it touches are
real. The background is in [Core API](03-core-api.md) and
[Web app](04-web-app.md).

## Overview

1. **Core**: in `apps/core/src/domains/<name>/`, the DTO classes, the client
   call, the controller method, and an application service if there is
   logic. A new domain also needs its `<name>.module.ts` in
   `src/app.module.ts`.
2. **Client**: `npm run api:gen` at the root.
3. **Web app**: use the generated hook in `src/features/<name>/`, and add a
   route in `src/routes/` if it is a new screen.

## 1. The DTO

Response types are classes in the domain's `*.dto.ts`, so the swagger plugin
sees them. Doc comments become the descriptions in the API docs.

```ts
// apps/core/src/domains/mesh/domain/mesh.dto.ts
export class MeshSummary {
  /** every node the radio has heard of */
  nodes!: number;
  /** nodes heard in the last hour */
  heardLastHour!: number;
}
```

A request body would also need `class-validator` decorators (`@IsString()`,
`@Min()`, ...), because the validation pipe drops undecorated fields.

## 2. The logic

Counting is logic, so it goes in `application/`, built on the existing
client in `infrastructure/`:

```ts
// apps/core/src/domains/mesh/application/mesh-summary.service.ts
@Injectable()
export class MeshSummaryService {
  constructor(private readonly mesh: MeshClient) {}

  async summary(): Promise<MeshSummary> {
    const nodes = await this.mesh.nodes();
    const since = Date.now() / 1000 - 3600;
    return {
      nodes: nodes.length,
      heardLastHour: nodes.filter((n) => (n.lastHeard ?? 0) >= since).length,
    };
  }
}
```

Add the service to `providers` in `mesh.module.ts`. When the mesh container
is not running, `MeshClient` throws the `503`, and the web app shows it.

## 3. The route

```ts
// apps/core/src/domains/mesh/api/mesh.controller.ts
/** Node counts for the Mesh screen. */
@Get('summary')
summary(): Promise<MeshSummary> {
  return this.summaries.summary();
}
```

Inject the service in the controller's constructor
(`private readonly summaries: MeshSummaryService`). The method name decides
the generated names: `MeshController.summary`
becomes the operation `meshSummary` and the hook `useMeshSummary()`.

## 4. Generate the client

```bash
npm run api:gen
```

This builds core, writes `packages/api-client/openapi.json` (no containers
needed) and regenerates `packages/api-client/src/generated/`. Check that
`useMeshSummary` and the model `MeshSummary` appeared, and commit the
generated files with the change.

## 5. The screen

Use the hook in the feature folder:

```tsx
// apps/web/src/features/mesh/Summary.tsx
import { useMeshSummary } from "@offline-pi/api-client";

export function Summary() {
  const { data } = useMeshSummary();
  if (!data) return null;
  return (
    <div className="readout">
      <span className="label">Heard last hour</span>
      <span className="readout-value">{data.heardLastHour} / {data.nodes}</span>
    </div>
  );
}
```

Place it in an existing screen of the domain. A new screen also needs a
route file in `apps/web/src/routes/`, wrapped in `<Screen>` and, for a
module, `<ModuleGate>`.

If the data changes live, don't poll: emit an event from the domain's
`*.events.ts`, register its payload class, add it to
`packages/api-client/src/events.ts` and update the Query cache with
`useSocketEvent`.

## 6. Try it

```bash
npm run dev:core
npm run dev:web
```

Open the screen on `http://localhost:5173`, and the endpoint in the Swagger
UI at `http://localhost:8080/api/docs`. Run `npm run typecheck` before you
commit, and `./start.sh` to try it in the real images.

## Checklist

- [ ] DTOs are classes in `*.dto.ts`, request DTOs validated
- [ ] Logic in `application/`, container calls in `infrastructure/`
- [ ] Controller method named for the client
- [ ] `npm run api:gen` run, generated files committed
- [ ] Data in the web app only through `@offline-pi/api-client`
- [ ] Screen uses Outpost components, no restyling
- [ ] The module's page in [Modules](../03-modules/README.md) updated if
      users see the change
