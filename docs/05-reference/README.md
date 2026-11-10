# Reference

Look-up pages for people who run or extend outpost: every setting in
`.env`, every path and port, the API of core and the words used throughout
these docs. The other chapters explain how things work; this one lists the
facts in tables.

The source of truth is always the project itself. When a page here and a
file in the checkout disagree, the file wins:

| Topic | Source in the checkout |
|---|---|
| Settings | `.env.example` |
| Containers, ports, mounts | `compose.yml` |
| Modules | `apps/<name>/module.json` |
| API | the OpenAPI document at `/api/openapi.json`, or `packages/api-client/openapi.json` |

## Pages

- [Settings](01-settings.md): every variable in `.env`, grouped by module,
  with its default, its meaning and who writes it.
- [Paths and ports](02-paths-and-ports.md): the screens, the API and
  passthrough paths, internal ports, container names, data mounts and log
  files.
- [API](03-api.md): core's REST endpoints by domain, the Socket.IO
  namespaces and events, error codes and the control PIN.
- [Glossary](04-glossary.md): core, module, domain, passthrough, ZIM,
  PMTiles, Meshtastic and the other terms used in these docs.
