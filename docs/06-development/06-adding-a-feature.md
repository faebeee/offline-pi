# Adding a feature

A feature goes from an endpoint in core to a screen in the web app in three
steps. This page walks through them with a small example: a summary of the
saved places, "how many places were added in the last week", shown on the
Maps screen.

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
// apps/core/src/domains/maps/domain/maps.dto.ts
export class MapsSummary {
  /** every saved place */
  places!: number;
  /** places added in the last week */
  addedLastWeek!: number;
}
```

A request body would also need `class-validator` decorators (`@IsString()`,
`@Min()`, ...), because the validation pipe drops undecorated fields.

## 2. The logic

Counting is logic, so it goes in `application/`, built on the existing
client in `infrastructure/`:

```ts
// apps/core/src/domains/maps/application/maps-summary.service.ts
@Injectable()
export class MapsSummaryService {
  constructor(private readonly maps: MapsClient) {}

  async summary(): Promise<MapsSummary> {
    const { pois } = await this.maps.pois();
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    return {
      places: pois.length,
      addedLastWeek: pois.filter((p) => Date.parse(p.createdAt) >= since).length,
    };
  }
}
```

Add the service to `providers` in `maps.module.ts`. When the maps container
is not running, `MapsClient` throws the `503`, and the web app shows it.

## 3. The route

```ts
// apps/core/src/domains/maps/api/maps.controller.ts
/** Saved place counts for the Maps screen. */
@Get('summary')
summary(): Promise<MapsSummary> {
  return this.summaries.summary();
}
```

Every route needs a login without you doing anything. If the action is
for admins only (it starts or stops something, or deletes shared data), take
`@Headers('x-pi-monitor') piMonitor` and `@CurrentUser() user` and call
`assertControl(piMonitor, user)` first; any other state-changing route
calls `assertCsrf(piMonitor)`. See
[Core API](03-core-api.md#accounts-and-admin-only-actions).

Inject the service in the controller's constructor
(`private readonly summaries: MapsSummaryService`). The method name decides
the generated names: `MapsController.summary`
becomes the operation `mapsSummary` and the hook `useMapsSummary()`.

## 4. Generate the client

```bash
npm run api:gen
```

This builds core, writes `packages/api-client/openapi.json` (no containers
needed) and regenerates `packages/api-client/src/generated/`. Check that
`useMapsSummary` and the model `MapsSummary` appeared, and commit the
generated files with the change.

## 5. The screen

Use the hook in the feature folder:

```tsx
// apps/web/src/features/maps/Summary.tsx
import { useMapsSummary } from "@outpost/api-client";

export function Summary() {
  const { data } = useMapsSummary();
  if (!data) return null;
  return (
    <div className="readout">
      <span className="label">Added last week</span>
      <span className="readout-value">{data.addedLastWeek} / {data.places}</span>
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
- [ ] Admin-only actions call `assertControl`, and the screen disables them
  for users (`useMe().isAdmin`)
- [ ] `npm run api:gen` run, generated files committed
- [ ] Data in the web app only through `@outpost/api-client`
- [ ] Screen uses Outpost components, no restyling
- [ ] The module's page in [Modules](../03-modules/README.md) updated if
      users see the change
