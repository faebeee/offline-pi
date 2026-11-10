# Web app

There is one UI: `apps/web` (`@outpost/web`). It holds every screen of
every module, is built into core's image and is served by core at `/`. It
follows the Outpost design system (see [Design system](05-design-system.md)).

Stack: Vite, React 19, TypeScript, TanStack Router (file routes) and
TanStack Query.

## Layout

```text
apps/web/src/
  main.tsx              # QueryClient, router, theme before first paint
  routes/               # one file per screen (/, /system, /maps, /mesh, ...)
  features/<domain>/    # components, hooks and CSS of one domain
  app/                  # Screen (frame), strip, Nav, realtime, maplibre, Boot
  ui/outpost.tsx        # React wrappers for the Outpost package
```

- **Routes**: TanStack Router file routes. `library.catalog.tsx` is
  `/library/catalog`, `mesh.index.tsx` is `/mesh/`. The Vite plugin
  regenerates `src/routeTree.gen.ts` (or run `npx tsr generate`).
- **Features**: everything specific to one domain lives in
  `src/features/<domain>/`. A route file stays short: it puts the feature's
  main component into a `Screen`.
- **`app/`**: the parts every screen shares. `__root.tsx` renders the frame,
  the shared status strip, the routes and the boot screen.

## A screen

```tsx
export const Route = createFileRoute("/mesh-map")({ component: MeshMapScreen });

function MeshMapScreen() {
  return (
    <Screen module="mesh-map" title="Node map" bleed>
      <ModuleGate id="mesh-map">
        <MeshMap />
      </ModuleGate>
    </Screen>
  );
}
```

- **`<Screen module title>`** is the frame: header with the module label,
  title, actions and theme toggle, an optional `context` line, the content
  and the module nav. `bleed` drops the padded grid for full-bleed maps.
- **`<ModuleGate id>`** renders its children only while the module's
  container runs. Otherwise it explains why (not installed, not configured,
  stopped) and offers START; the screen appears as soon as the module is up.
  Screens that core serves itself (System, Logs, Info) need no gate.
- The nav and the home tiles come from `GET /api/modules`, so a new module
  needs no change in `packages/ui`.

## Status strip

The status strip stays mounted across routes (one clock). Each screen sets
its part while it is shown, with the hooks from `src/app/strip.tsx`:

```tsx
useStripLink(data ? "ok" : "cau", data ? "LOCAL · 3 REGIONS" : "LOCAL · CONNECTING");
useStripItems([{ label: "NODES", value: "12" }]);
```

The rule for the link: the LED is the screen's link to **its own local data
source**, written `<SOURCE> · <STATE>`. `ok` when connected or loaded,
`cau` while connecting or stale, `crit` on failure with a short reason.
Other facts go in the items, never in the link text.

## Data

Data only comes through `@outpost/api-client`:

- **REST**: the generated hooks, for example `useMapsRegions()` or
  `useMeshSend()`. No hand-written `fetch` to `/api`.
- **Live updates**: `useSocketEvent("/<domain>", "<event>", handler)` from
  `src/app/realtime.ts`. Write what arrives into the Query cache with the
  generated `get...QueryKey()`, so every component sees it.
- **Raw files** (tiles, `.pmtiles`, kiwix pages): through core's passthrough
  `/svc/<module>/`.
- Never a module's container directly, and no runtime requests to the
  internet: no CDNs, web fonts or remote icons.

```tsx
const qc = useQueryClient();
useSocketEvent("/mesh", "nodes", (nodes) => {
  qc.setQueryData(getMeshNodesQueryKey(), nodes);
});
```

`realtime.ts` keeps one Socket.IO connection per namespace, shared by every
component that uses it, and closes it a moment after the last one unmounts.
`useSocket(ns)` also tells whether it is connected, which is what the strip
link usually shows.

The `QueryClient` in `main.tsx` retries a failed query at most twice, and
not at all when core answered with an HTTP status.

## Maps

Every map screen imports MapLibre from `src/app/maplibre.ts`, never
`maplibre-gl` directly. That module:

- loads MapLibre's worker as a local asset, so nothing is fetched from a CDN,
- registers the `pmtiles://` protocol once (`registerPmtiles()`), for range
  requests to `/svc/<module>/`.

Styles come from the API (`GET /api/maps/styles/:name`), with source URLs
that already point at `/svc/maps/`.

## Design rules for screens

- Build only from the Outpost components (`src/ui/outpost.tsx`: `Icon`,
  `Badge`, `Banner`, `HoldButton`, `Progress`, `ThemeToggle`,
  `Illustration`, ...) and the package's classes.
- Don't restyle components per feature. Feature CSS
  (`features/<domain>/<domain>.css`) uses tokens only.
- Missing a component? Add it to `packages/ui` and note it in the `DESIGN.md`
  changelog.

## Development

```bash
npm run dev:core   # core on :8080
npm run dev:web    # this app on :5173
```

The Vite dev server proxies `/api`, `/socket.io` and `/svc` (WebSockets
included) and `/ui` to core. `CORE_URL` points it at another core, for
example a running Pi. `npm run build` writes `apps/web/dist`, which core
serves; core's image builds it itself.
