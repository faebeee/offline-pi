# Plan: `apps/portal`, landing page and captive portal

> **Status (2026-11):** the tile list is done differently: core's home page
> (`/` on `PORT`) shows every installed module with its state, from the
> module manifests, and links by path on the same origin (no port probing).
> What is still open here is the info pages and the captive portal; build
> them into core (or as a module) and redirect port 80 to core's `PORT`.

## What it is

One page that every device on the hotspot lands on. It shows:

- a tile per outpost app (name, description, online/offline dot), linked
  with the hostname the visitor used, so links work via hotspot IP, LAN IP
  or `<hostname>.local`;
- a short "read this first" emergency section (emergency numbers, what this
  box is, where to find first aid in the knowledge app);
- editable info pages (meeting points, household contacts, local notes).

When a phone joins the hotspot, it should open this page by itself
(captive portal) or at least reach it at `http://<anything>/`.

## Architecture

- **Container:** pinned upstream `nginx:<version>-alpine` with a small
  `Dockerfile` that copies `site/` (static HTML/CSS/JS) and `nginx.conf`
  into the image. No backend: nothing to keep running but nginx.
- **App list:** `site/apps.json` baked into the image as the default, can be
  overridden by `${CONTENT_DIR}/apps.json`. Each entry:
  `{ "id", "name", "description", "port", "path", "icon" }`.
- **Status dots:** the browser checks each app with
  `fetch("http://" + location.hostname + ":" + port + path, { mode: "no-cors" })`
  and a short timeout. An opaque response means up, a network error means
  down. No CORS changes needed in the other apps.
- **Info pages:** Markdown files in `${CONTENT_DIR}/pages/*.md`, rendered in
  the browser by a vendored copy of `marked` (copied into the image at
  build time, no CDN). `install.sh` seeds `CONTENT_DIR` with default pages
  on first run and never overwrites existing ones.
- **Captive portal (host level, optional):**
  1. DNS: `/etc/NetworkManager/dnsmasq-shared.d/outpost-portal.conf`
     with `address=/#/10.42.0.1`. This only affects the dnsmasq that
     NetworkManager starts for the hotspot (`ipv4.method shared` in
     `apps/hotspot-pi`), so it does nothing when the Pi is on the home WLAN.
     Read the actual hotspot IP from `nmcli` rather than assuming
     `10.42.0.1`.
  2. Port 80: an nftables table `outpost_portal` that redirects
     `tcp dport 80` to `${PORT}`, installed as
     `/etc/nftables.d/outpost-portal.nft` plus a oneshot systemd unit
     `outpost-portal-redirect.service`. Chosen over lowering
     `net.ipv4.ip_unprivileged_port_start`, which would open all low ports
     to every user.
  3. nginx answers the OS connectivity checks:
     `/generate_204` (Android), `/hotspot-detect.html` (Apple),
     `/connecttest.txt` + `/ncsi.txt` (Windows), `/success.txt` (Firefox).
     Behaviour is controlled by `CAPTIVE_MODE`:
     - `popup`: redirect to `/` so phones show the "sign in to network"
       sheet with the portal;
     - `quiet` (default): return the "online" answers so phones stay
       connected and don't switch to mobile data, and users open the
       portal by typing any `http://` address.
     `quiet` is the default because some Android versions disconnect from
     WLANs that look like captive portals without internet.
- **Limit to document:** HTTPS sites can't be redirected (certificate
  error). Users need to type an `http://` address, e.g. `http://pi`.

## `.env` variables

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8083` | Host port; port 80 is redirected here when captive is on |
| `BIND_ADDRESS` | `0.0.0.0` | |
| `CONTENT_DIR` | `./content` | `apps.json` override + `pages/*.md`; small, SD card is fine |
| `CAPTIVE_PORTAL` | `no` | `yes` installs the DNS + port 80 host config |
| `CAPTIVE_MODE` | `quiet` | `quiet` or `popup`, see above |
| `HOTSPOT_IFACE` | `wlan0` | Used to find the hotspot IP |

## Sessions

### P1: Scaffold and app tiles
**Goal:** portal runs on 8083 and lists the existing apps.

- [ ] `apps/portal/` with `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
      `.env.example`, `install.sh`, `start.sh`, `uninstall.sh` (copied from
      `apps/monitor/uninstall.sh`, config block only), `lib/deps.sh`.
- [ ] `site/index.html`, `site/app.js`, `site/styles.css`: tiles from
      `apps.json`, status dots, mobile-first layout (phones are the main
      client), light/dark via `prefers-color-scheme`.
- [ ] Default `apps.json` with monitor, maps, knowledge.
- [ ] Healthcheck: `wget -qO- http://127.0.0.1:8080/healthz` (nginx
      `location = /healthz { return 200; }`), as `CMD-SHELL`.

**Done when:** `./install.sh` on the Pi brings it up, the page loads on a
phone over the LAN, and stopping `apps/maps` turns its dot red within a few
seconds.

### P2: Emergency info and editable pages
**Goal:** useful content without internet, editable without rebuilding.

- [ ] Vendor `marked` (pinned version) into the image at build time.
- [ ] `${CONTENT_DIR}/pages/*.md` listed on the page, rendered on click;
      `00-read-this-first.md` shown expanded at the top.
- [ ] Seed pages (German, Swiss spelling): emergency numbers
      (112, 117, 118, 144, 1414 Rega, 145 Tox Info), "what is this box",
      household contacts template, meeting points template, "check
      Alertswiss / radio for official instructions".
- [ ] `install.sh` seeds missing pages only; `CONTENT_DIR` follows the
      storage-path rules (re-prompted, relocatable).
- [ ] `manage.sh`: `pages` (list), `edit <page>` (opens `$EDITOR`),
      `apps` (print effective app list), `logs`, `status`.

**Done when:** editing a page with `./manage.sh edit` shows up after a
browser reload, without restarting the container.

### P3: Captive portal
**Goal:** joining the hotspot leads to the portal.

- [ ] `lib/captive.sh` with `captive_install` / `captive_remove`: dnsmasq
      snippet, nft file, systemd unit; each step idempotent and logged.
      Reload with `nmcli connection down/up pi-hotspot` only if the hotspot
      is currently active (warn first: this drops connected clients).
- [ ] `install.sh` asks "Enable captive portal on the hotspot?" (first run),
      stores `CAPTIVE_PORTAL`, and applies or removes the host config to
      match on every run.
- [ ] nginx connectivity-check locations driven by `CAPTIVE_MODE`
      (template the config at container start with `envsubst`, which the
      official nginx image supports via `/etc/nginx/templates`).
- [ ] `uninstall.sh`: add a hook before the shared body that runs
      `captive_remove`. Keep the shared body identical to the other apps.
- [ ] Test matrix on the Pi hotspot: Android, iPhone, a laptop; both modes.

**Done when:** in `quiet` mode an Android phone stays connected and
`http://pi/` opens the portal; in `popup` mode the sign-in sheet shows the
portal; on the home WLAN, DNS behaves normally.

### P4: Docs and integration
- [ ] `apps/portal/README.md` per AGENTS.md (quick start, install steps,
      config table, captive portal section incl. HTTPS limitation,
      uninstall).
- [ ] Root `README.md` row + port table.
- [ ] Mention in `apps/hotspot-pi` docs that the portal adds DNS config to
      the hotspot.

**Done when:** a fresh clone on the Pi only needs `cd apps/portal && ./install.sh`.
