# outpost documentation

outpost is one self-hosted app for a Raspberry Pi that keeps working
without internet: offline maps, an emergency-knowledge library, Meshtastic
messaging, a live map of the mesh and a dashboard for the Pi itself, all on
one port and in one web app.

This documentation is plain Markdown in the `docs/` folder of the project.
Read it wherever is easiest:

- **In the app**: the Info module (`http://<pi>:8080/info`) shows these files
  with navigation and search.
- **Without the app**: open the files in any editor or file browser, or on
  the project's Git host. Every chapter is a folder with a `README.md` that
  lists its pages, and the numbers in the names keep them in reading order.
  This is the way in when outpost does not start.

## Chapters

| Chapter | What it covers |
|---|---|
| [1. Overview](01-overview/README.md) | What outpost is, how it is put together, which hardware it needs |
| [2. Installation](02-installation/README.md) | Installing, storage on an SSD, network and hotspot, macOS for development |
| [3. Modules](03-modules/README.md) | Using the web app: Home, Maps, Library, Mesh, System, Logs, Info |
| [4. Operations](04-operations/README.md) | Everyday commands, updates, backups, uninstalling, troubleshooting |
| [5. Reference](05-reference/README.md) | Every setting, ports and paths, the API, a glossary |
| [6. Development](06-development/README.md) | Architecture, the monorepo, adding features and modules, these docs |
| [7. Changelog](07-changelog.md) | What changed in each version |

## When outpost does not start

1. Run `./manage.sh status` in the project folder to see which containers
   run.
2. Read [Troubleshooting](04-operations/05-troubleshooting.md).
3. Follow the logs with `./manage.sh logs` (core) or
   `./manage.sh logs <module>`.
4. Re-run `./start.sh`: it rebuilds what changed and recreates every
   container. `./install.sh` is safe to re-run too.
