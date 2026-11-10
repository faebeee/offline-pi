# Development

This chapter is for people who change offline-pi itself: fix a bug, add a
screen or an endpoint, add a whole module, or work on the scripts and these
docs. You need a checkout, Node.js 22 or newer and, to run the stack,
Podman. A Mac works for most of it (see
[macOS](../02-installation/04-macos.md)).

If you only run offline-pi, you don't need this chapter: start with
[Installation](../02-installation/README.md) and
[Operations](../04-operations/README.md).

The conventions here follow `AGENTS.md` in the project root, which is the
short version for coding agents. When the two disagree, fix one of them.

## Pages

- [Architecture](01-architecture.md): how the browser, core and the module
  containers fit together; the supervisor, the passthrough and live
  updates.
- [Monorepo and builds](02-monorepo-and-builds.md): npm workspaces,
  Turborepo, the root scripts, how images are built and the local dev setup.
- [Core API](03-core-api.md): the domain layout of core, talking to a
  container, DTOs and OpenAPI, events and the generated client.
- [Web app](04-web-app.md): routes and features, the screen frame, data
  through the generated client, live updates and maps.
- [Design system](05-design-system.md): Outpost, the tokens, themes,
  components, motion and illustrations, and its rules.
- [Adding a feature](06-adding-a-feature.md): from a new endpoint to a new
  screen, step by step.
- [Adding a module](07-adding-a-module.md): every step for a new module,
  from `module.json` to the docs.
- [Scripts](08-scripts.md): conventions for `install.sh`, `start.sh` and the
  other shell scripts, prompts and portability.
- [Documentation](09-documentation.md): how these docs are organised, shown
  in the app and written.
- [Plans](plans/README.md): historical implementation plans (portal, mesh,
  radio), written before offline-pi became one app. Kept for reference.
