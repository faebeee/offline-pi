# Scripts

The shell scripts in the project root install, start, update, manage and
uninstall outpost. They run on a Raspberry Pi (Bash 5) and on a Mac
(Bash 3.2), so they follow a few strict conventions. What each script does
for the user is in [Everyday commands](../04-operations/01-everyday-commands.md).

## Files

| File | Role |
|---|---|
| `install.sh` | Choose and configure modules, write `.env`, build, then `exec start.sh` |
| `start.sh` | Rebuild, recreate the containers; core starts the modules |
| `update.sh` | Pull a new version, then `start.sh --pull` |
| `manage.sh` | Status, start/stop, logs, module commands |
| `uninstall.sh` | Remove containers and images; data only after confirmation |
| `lib/common.sh` | Log helpers, the `compose` wrapper, `.env` helpers, Podman checks |
| `lib/platform.sh` | Linux and macOS differences, Bash 3.2 stand-ins |
| `lib/ui.sh` | Prompts, menus and the progress spinner |
| `lib/storage.sh` | `prompt_dir` and `resync_dir` (relocatable data) |
| `lib/modules.sh` | Module registry from the manifests, hooks, `core_api` |
| `lib/install.sh`, `lib/update.sh`, `lib/migrate.sh`, `lib/serial.sh` | Steps of `install.sh` and `update.sh`, old layout and old name (offline-pi) migration, USB serial picker |
| `lib/modules/<name>.sh` | One module's hooks |

Put logic in `lib/*.sh` rather than growing the entry scripts.

## Header

Every script starts the same way:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

source "$ROOT_DIR/lib/common.sh"
```

`lib/common.sh` loads `lib/platform.sh` and `lib/ui.sh` itself. Source the
other `lib/` files the script needs after it, and call `load_module_hooks`
to load every `lib/modules/*.sh`.

## Logging

```bash
log_info "Building images"     # [info] in blue
log_warn "SSD not mounted"     # [warn] in yellow
log_error "Run ./install.sh first."   # [error] in red, on stderr
log_ok "core is up"            # a green check mark
```

## Prompts: lib/ui.sh

Interactive input goes through `lib/ui.sh`. It draws on stderr, so prompts
work inside `$(...)`, and it needs no dependencies.

| Function | Use |
|---|---|
| `ui_input QUESTION DEFAULT [VALIDATOR]` | Text; Enter keeps the default. The validator is a function that prints why an answer is wrong and returns non-zero. |
| `ui_confirm QUESTION y\|n` | Yes or no; returns 0 for yes. |
| `ui_select QUESTION DEFAULT ITEM...` | One of a list; each item is `"value\|label\|hint"`. |
| `ui_multiselect QUESTION ITEM...` | Several of a list; items are `"value\|label\|hint\|on"`. The answer is the chosen values, comma separated. |
| `ui_run MESSAGE COMMAND [ARGS...]` | Run a long step with a spinner and its latest output line; the full output goes to `UI_LOG`, the end of it is shown on failure. |
| `ui_banner`, `ui_step N TOTAL TITLE`, `ui_note TEXT` | Headings and dimmed explanations. |

The answer of `ui_input`, `ui_select` and `ui_multiselect` is left in the
global `UI_REPLY` (Bash 3.2 has no namerefs). Read it right after the call:

```bash
ui_input "Port for the web app" "$port" valid_port
set_env PORT "$UI_REPLY"
```

Environment switches, set by the scripts' flags:

| Variable | Effect |
|---|---|
| `UI_PLAIN=true` | Line-by-line `read` prompts instead of menus (also used without a terminal) |
| `UI_ASSUME_YES=true` | Never ask; every prompt takes its default (`--yes`) |
| `UI_VERBOSE=true` | `ui_run` streams the output instead of a spinner (`--verbose`) |
| `UI_LOG=FILE` | Where `ui_run` writes the output (`install.log`, `start.log`) |

`uninstall.sh` is the exception: it is self-contained, uses plain
`read -r -p` prompts and works without `.env` and without Podman.

## Portability: macOS Bash 3.2

macOS ships Bash 3.2 and BSD tools. Therefore:

- No `mapfile` or `readarray`: use `read_lines NAME COMMAND` from
  `lib/platform.sh`.
- No associative arrays (`declare -A`) and no namerefs: use plain functions
  or globals like `UI_REPLY`.
- No `sed -i` (GNU and BSD differ): `set_env` uses `awk` and a temp file.
- No GNU-only flags of `stat`, `df` or `sed`: use the helpers
  (`file_group`, `free_space`) or flags both versions know.
- Test `is_macos` for what differs: Podman runs in a Podman machine, USB
  devices can't be passed through, and `start.sh` forwards `PORT` into the
  VM.

## Compose

Every compose call goes through `compose` in `lib/common.sh`:

```bash
compose up -d --no-start --force-recreate maps
```

It adds `-p outpost -f compose.yml --env-file .env`, plus
`compose.macos.yml` on a Mac. It prefers `podman compose` and falls back to
`podman-compose` (always `podman-compose` on macOS). Never call `docker`,
`docker-compose` or `podman-compose` directly.

## .env

- Only `install.sh` writes `.env`, with `set_env KEY VALUE` (replaces or
  appends; any character is fine in the value). `start.sh` and `manage.sh`
  only read it (`get_env KEY`, `load_env`). `update.sh` never writes it.
- `start.sh` requires `.env` and never prompts:
  `log_error "Run ./install.sh first."`.
- A new setting goes into `.env.example` and gets a default in
  `compose.yml`, so existing installs work without it.

## Hooks

Module hooks live in `lib/modules/<name>.sh`, named `<name>_<hook>` with
dashes turned into underscores. `run_hook` calls them and returns 127 when a
module has none.

| Hook | Called by |
|---|---|
| `<name>_configure` | `install.sh`, every run while installed |
| `<name>_prepare` | `install.sh` and `start.sh`, before building |
| `<name>_post_build` | `install.sh`, after building |
| `<name>_manage` / `<name>_usage` | `./manage.sh <name> <cmd>`; return 2 for an unknown command |

A configure hook re-asks every data directory, with the current value as
default:

```bash
radio_configure() {
  local old new
  old="$(get_env RADIO_DATA_DIR)"; old="${old:-./data/radio}"
  new="$(prompt_dir "Radio: where should its data be stored?" "$old")"
  resync_dir "$old" "$new" "radio data"
  set_env RADIO_DATA_DIR "$new"
}
```

## Safety rules

- `install.sh` is idempotent: safe to re-run, the current answers are the
  defaults.
- Destructive commands confirm first and never silently delete data.
- `uninstall.sh` keeps every `*_DIR` unless each is confirmed (or
  `--purge`), and never deletes `/`, `$HOME`, mount roots or anything
  containing the checkout.
- Module start and stop go through core (`core_api`), so the web app's
  state stays right.
- Every installer has an uninstaller that reverses it, also for host
  utilities like `host/hotspot-pi`.
