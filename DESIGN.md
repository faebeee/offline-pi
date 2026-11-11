# OUTPOST Design System

Frontend guide for the Outpost suite: offline-first apps for disasters, emergencies and off-grid use (offline maps, Kiwix library, Meshtastic mesh, and future modules).

**Audience:** coding agents and developers building any Outpost app UI. Follow this file exactly. If something is not covered here, extend it in the same spirit and note the addition at the end of this file.

---

## 1. Non-negotiable rules

1. **Offline is the default.** No runtime requests to CDNs, Google Fonts, analytics, icon services or external APIs. Every font, icon, script and style ships inside the app.
2. **Use tokens only.** Never hard-code a hex color, font or spacing value in a component. Reference the CSS custom properties in section 3.
3. **Both themes must work.** Every screen is tested in `.t-dark` (default) and `.t-light`.
4. **Never rely on color alone.** Every status = color + icon shape + written label.
5. **Touch targets are at least 44 x 44 px.** The main action on a screen is 56 px tall.
6. **One primary (amber) action per view.** Amber is reserved for the main action, the user's own position, the active nav item and focus rings.
7. **Motion and art serve the signal.** Motion follows state or a screen change (boot-in, a live LED, a pressed control); continuous loops only in illustrations and live indicators. Glow (`--glow-*`) only on live or active elements, dark theme only. No blur, emoji or stock imagery; illustrations come from `packages/ui/illustrations.js` (see 0.6).
8. **Respect `prefers-reduced-motion`** and `html.motion-off` (low power): everything stops. Feedback transitions stay at `--dur-fast` (120 ms); entrances at most `--dur-slow`. Animate transform and opacity; never delay the user (the boot screen is skippable and once per session).
9. **Status is always visible.** Every screen shows the same status strip (link to core, host vitals, UTC time).
10. **Text contrast is at least 4.5:1** in both themes, including small mono labels.

---

## 2. Look and feel

A field terminal that survived the collapse: cyberpunk signal light on post-apocalyptic ground. Tactical and modern, never noisy. Think salvaged military instrument with a working screen, not video game.

| Motif | Use |
| --- | --- |
| Grid background (24 px) | Behind scrolling content areas |
| Corner brackets (amber, 12 px) | Marks the live or focused element: hero card, current-position panel, selected tile |
| Chamfered corner (10 px) | Decorative panels only, never focusable elements (it clips the focus ring) |
| Caution hatch (45° stripes) | Left edge of caution banners, warning zones |
| Status light (8 to 10 px dot) | Link, node and system state |
| Monospace uppercase labels | All metadata, units, coordinates, timestamps |
| Scanlines (static, `--scan`) | Over the whole frame, dark theme only |
| Signal sweep | The header's bottom line lights up once when a screen opens; titles lock in with a short glitch |
| Line-art illustrations | Ruins, the outpost mast, one scene per module; empty states, gates, the Home hero, faint in tiles |

Shape: radius `2px` for controls, `0` for panels. Depth comes from stepping surfaces (`--s1`, `--s2`, `--s3`) plus 1 px lines. No drop shadows; the only shadow is signal glow (`--glow-*`).

---

## 3. Tokens

Copy this into `tokens.css` and load it in every app. Put the theme class on `<html>` or the app root.

```css
:root, .t-dark {
  /* Surfaces */
  --bg: #0A0E0D;        /* app ground */
  --s1: #111715;        /* cards, headers, nav */
  --s2: #18201D;        /* inputs, nested panels */
  --s3: #222C28;        /* tracks, disabled, empty cells */
  --line: #2B3833;      /* dividers */
  --line2: #405049;     /* control borders */
  /* Text */
  --fg: #E4ECE8;
  --fg2: #A9B9B2;       /* secondary */
  --fg3: #82958D;       /* labels, placeholders */
  /* Signal (primary accent) */
  --acc: #FFB020;       /* fills, rings, brackets */
  --acc-ink: #FFB020;   /* amber text/icons */
  --on-acc: #1A1100;    /* text on amber */
  --acc-soft: rgba(255,176,32,.12);
  /* Status */
  --info: #4CC9E0;  --info-soft: rgba(76,201,224,.12);
  --ok:   #3FD68A;  --ok-soft:   rgba(63,214,138,.12);
  --cau:  #FFD84A;  --cau-soft:  rgba(255,216,74,.12);
  --crit: #FF5A52;  --crit-soft: rgba(255,90,82,.14);
  --on-crit: #1A0302;
  /* Misc */
  --grid: rgba(140,190,165,.06);
  --map: #0E1412;
  /* Glow (0.6): live and active elements, dark theme only */
  --glow-acc: 0 0 10px rgba(255,176,32,.45);
  --glow-ok: 0 0 8px rgba(63,214,138,.5);
  --glow-info: 0 0 8px rgba(76,201,224,.45);
  --glow-crit: 0 0 10px rgba(255,90,82,.55);
  --scan: rgba(140,190,165,.035);   /* CRT scanlines over the frame */
}

.t-light {
  --bg: #E8ECE9;
  --s1: #FFFFFF;
  --s2: #F2F5F3;
  --s3: #E1E7E3;
  --line: #C8D1CC;
  --line2: #97A69F;
  --fg: #0C1210;
  --fg2: #3A4843;
  --fg3: #55645E;
  --acc: #FFA51F;
  --acc-ink: #8A5200;   /* amber is too light for text on light ground */
  --on-acc: #1A1100;
  --acc-soft: rgba(255,165,31,.16);
  --info: #0A6F82;  --info-soft: rgba(10,111,130,.10);
  --ok:   #0F7A45;  --ok-soft:   rgba(15,122,69,.10);
  --cau:  #7A5C00;  --cau-soft:  rgba(230,180,0,.18);
  --crit: #B8231E;  --crit-soft: rgba(184,35,30,.10);
  --on-crit: #FFFFFF;
  --grid: rgba(20,60,40,.06);
  --map: #F1F3EC;
  /* no glow or scanlines in daylight */
  --glow-acc: 0 0 0 transparent;
  --glow-ok: 0 0 0 transparent;
  --glow-info: 0 0 0 transparent;
  --glow-crit: 0 0 0 transparent;
  --scan: transparent;
}

:root {
  /* Type */
  --font-display: 'Chakra Petch', system-ui, sans-serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  /* Space (4 px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;
  /* Shape */
  --radius: 2px;
  --chamfer: 10px;
  --bracket: 12px;
  /* Sizing */
  --target: 44px;
  --target-primary: 56px;
  --strip-h: 32px;
  --nav-h: 64px;
  /* Motion (0.6) */
  --dur-fast: 120ms;   /* feedback: hover, press, toggles */
  --dur: 240ms;        /* entrances, state changes */
  --dur-slow: 600ms;   /* screen boot-in, signal sweep */
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --ease-snap: cubic-bezier(.3, 1.5, .5, 1);
}
```

### Token usage

| Need | Token |
| --- | --- |
| Page background | `--bg` (+ `.grid-bg` for content areas) |
| Card / header / bottom nav | `--s1` with `1px solid var(--line)` |
| Input, nested panel, icon button | `--s2` with `1px solid var(--line2)` |
| Track, disabled, empty segment | `--s3` |
| Primary button | bg `--acc`, text `--on-acc` |
| Amber text or icon | `--acc-ink` (never `--acc` for text) |
| Row / banner state tint | `--*-soft` background + `--*` border |
| Badge / LED | solid `--ok`, `--info`, `--cau`, `--crit` |

### Theme switching

- Default to `.t-dark`. Persist the user's choice locally (e.g. `localStorage` key `outpost.theme`, wrapped in try/catch).
- Optionally follow `prefers-color-scheme` on first run.
- The toggle is a 44 px icon button in the header: moon icon in dark mode, sun icon in light, `aria-label="Switch to day theme"` or `"Switch to night theme"`.
- Possible later theme: `.t-red` (red-only night vision). Add it by redefining the same tokens; components must not change.

---

## 4. Typography

Self-host WOFF2 files (all three fonts are under the SIL Open Font License). Use `font-display: swap`.

| Role | Font | Weight | Size / line | Notes |
| --- | --- | --- | --- | --- |
| display | Chakra Petch | 700 | 56/60 | Splash, big readouts. Letter spacing .02em |
| h1 | Chakra Petch | 600-700 | 22-32 / 26-36 | UPPERCASE, letter spacing .04-.06em |
| h2 | Chakra Petch | 600 | 20-22 / 28 | Section titles |
| body | IBM Plex Sans | 400 | 16/24 | Default text. Never smaller than 15 px for reading |
| body-sm | IBM Plex Sans | 400 | 14/20 | Secondary lines, helper text |
| label | JetBrains Mono | 500 | 11/16 | UPPERCASE, letter spacing .12em, color `--fg3` |
| data | JetBrains Mono | 500 | 14-28 | `font-variant-numeric: tabular-nums` |
| button | Chakra Petch | 600-700 | 14-16 | UPPERCASE, letter spacing .08em |

Rules:

- All numbers, coordinates, frequencies, times and IDs use mono with tabular figures.
- Times are shown in UTC with a `Z` suffix (`14:32Z`) unless the module says otherwise.
- Coordinates: `47.37690 N · 008.54170 E` (5 decimals, zero-padded longitude, middle dot separator).
- Callsigns and node names: mono, uppercase (`DELTA-2`).

---

## 5. Icons

- 24 px grid, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`, `stroke-linecap="square"`.
- Inline SVG or a bundled sprite. No icon fonts loaded from the web.
- Decorative icons: `aria-hidden="true"`. Icon-only buttons: `aria-label` on the button.
- Status shapes are fixed and must not be swapped:

| State | Shape | Color |
| --- | --- | --- |
| Info | circle with "i" | `--info` |
| OK | check mark | `--ok` |
| Caution | triangle with "!" | `--cau` |
| Critical / SOS | octagon with "!" or "x" | `--crit` |
| Offline | wifi arc with slash | `--fg2` |

Core set: map, library (open book), mesh (antenna with arcs), hub (2x2 squares), locate (crosshair circle), waypoint (pin), layers, search, send, download, plus, minus, back chevron, sun, moon.

---

## 6. Layout and app frame

Every app screen has this structure, top to bottom:

```
┌ Status strip      32 px   --bg, mono 11 px: link to core · host vitals · UTC
├ Header            ~64 px  --s1: back (44), label + H1, actions (44)
├ [Context bar]     40 px   optional --s2: radio/channel/sync info
├ [Pinned alert]            optional critical banner (e.g. active SOS)
├ Content           flex 1, scrolls, .grid-bg, 16 px padding, 16 px gap
├ [Composer/Action]         optional sticky action area
└ Bottom nav        64 px   --s1, 4 to 5 module links
```

- Phone first (390 px reference width). On tablets and desktop, the bottom nav becomes a left rail (`flex-wrap` layout, content `flex: 999 1 560px`), but it is never sticky to `100vh`.
- Content padding 16 px on phones, 24 to 32 px on larger screens.
- Use flex or grid with `gap`, never margins between siblings.
- Status strip example: `● CORE · LIVE    TEMP 52°C  VOLT 5.08 V  CPU 4%  MEM 7%  DISK 23/57 GB    14:32Z`. Since 0.9 it is the same on every screen; a screen's own facts go in its context line. The square LED shows the app's link to its own local data source: `--ok` when connected or loaded, `--cau` while connecting, reconnecting or stale, `--crit` on failure (see the 0.2 changelog).

---

## 7. Components

Specs below are the contract. Build them once in a shared package and reuse them in every app.

### Buttons

| Variant | Height | Background | Text | Border |
| --- | --- | --- | --- | --- |
| Primary | 56 | `--acc` | `--on-acc`, 700 | none |
| Secondary | 44 (56 in action bars) | transparent | `--fg`, 600 | `1px --line2` |
| Ghost | 44 | transparent | `--fg2`, 600 | none |
| Critical | 44 | `--crit` | `--on-crit`, 700 | none |
| Disabled | 44 | `--s3` | `--fg3` | `1px dashed --line2` |
| Icon | 44 x 44 | `--s2` | `--fg` | `1px --line2` |
| Icon (active) | 44 x 44 | `--acc-soft` | `--acc-ink` | `1px --acc` |

- Label is a verb, uppercase: `SAVE WAYPOINT`, `GO TO WP-014`, `SEND`.
- Disabled buttons explain why in the label or next to it (`SYNC · NO LINK`).
- **Hold to confirm** for irreversible or broadcast actions (SOS, wipe, delete region): 64 px, `--crit-soft` bg, `--crit` border and text, fill bar grows over ~3 s, shows elapsed time (`1.2 / 3.0 S`). Releasing early cancels. Must also work by keyboard (hold Space/Enter).

### Inputs

- Height 48, bg `--s2`, border `1px --line2`, radius 2, 16 px text (prevents zoom on mobile).
- Label above in `label` style, linked with `for`/`id`. Helper text below, 13 px `--fg3`.
- Error: bg `--crit-soft`, border `--crit`, label in `--crit`, message with octagon icon, `aria-invalid="true"`.
- Search field: leading search icon, optional trailing scope badge (`LOCAL`).
- Data entry fields (callsign, frequency) use mono.

### Toggle switch

`<button role="switch" aria-checked>` 64 x 36. Off: track `--s3`, knob `--fg3`. On: track `--acc`, knob `--on-acc`, knob right. Row has title (16 px, 500) and description (13 px `--fg2`).

### Segmented control

Container `--s2` with border and 3 px padding. Segments are buttons, 40 px tall, mono 12 px uppercase. Active: `--acc` bg, `--on-acc` text, `aria-pressed="true"`.

### Chips / filters

36 px tall (min 44 px wide hit area), mono 11 px uppercase. Active as segmented. Inactive `--s1` bg with `--line2` border.

### Checkbox

Native `<input type="checkbox">` 20 px with `accent-color: var(--acc)`, inside a `<label>` row at least 44 px tall.

### Badges

28 px tall, mono 11 px uppercase, icon 14 px + word. Soft bg + solid border + colored text: `SYNCED` (ok), `SYNCING` (info), `LOW BATTERY` (cau), `OFFLINE` (neutral `--s3`). `SOS` is the only solid-fill badge (`--crit` bg).

### Telemetry readouts

Card `--s2`, label on top, big mono value (28 px) with small unit in `--fg3`, then a visual:

- **Power:** 10 segment cells, lit `--ok` (switch to `--cau` at ≤30%, `--crit` at ≤10%).
- **Link / SNR:** 5 ascending bars.
- **GNSS:** status LED + satellite count + accuracy.
Use corner brackets on the readout that is currently most important.

### Progress and storage

- Progress: segmented bar (e.g. 32 cells, 2 px gaps), lit `--info`. Title left, `62% · 1.4 / 2.3 GB` right in mono.
- Storage: one stacked bar with a fixed color per module (maps `--acc`, library `--info`, mesh `--ok`, free `--s3`) plus a mono legend.

### Banners

Full width, icon + title (15 px 600) + body (14 px `--fg2`) + optional action.

- Info: `--info-soft` bg, `1px --info` border.
- Caution: `--s2` bg, `1px --cau` border, 12 px hatched strip on the left.
- Critical: `--crit-soft` bg, **2 px** `--crit` border, solid critical action button. Critical banners can be pinned under the header and stay until resolved.

### Toast

52 px tall, inverted colors (`--fg` bg, `--bg` text), check icon, message, optional `UNDO`. Auto-dismiss after 5 s, never for critical information. Use `aria-live="polite"`.

### Empty state

Dashed `--line2` border on grid background, large thin icon (40 px, `--fg3`), title in display font 18 px, one sentence saying what will happen or what to do.

### Cards and readouts

- Card: `--s1`, `1px --line`, 14 to 16 px padding, label at top.
- Position readout: label + `LIVE` LED, coordinates in mono 22 to 28 px, then a row of cells split by 1 px lines (ALT, ACC, HDG, distance and bearing to target).

### Lists

Row min 60 px (72 px with avatar/monogram), 1 px bottom line, structure: LED or 40 px mono monogram → title + mono meta line → right value (mono) → chevron. Whole row is one `<a>` or `<button>`.

### Tabs

`role="tablist"`, tab buttons 48 px tall, mono 12 px uppercase. Active: `--fg` text + 2 px `--acc` bottom border, `aria-selected="true"`. Inactive `--fg3`.

### Module tile (Hub)

`<a>`, min 124 px tall, `--s1` bg, `1px --line2` border. Icon 28 px top left, name (display 18 px uppercase) + mono status line at the bottom. Optional count badge top right (`1 SOS` in solid crit). "Add module" tile: transparent with dashed border and `--fg3` text.

### Bottom navigation

`<nav aria-label="Modules">`, 64 px, equal columns, icon 22 px + mono 11 px label. Active item: `--acc-ink` color, 2 px amber line on top (`box-shadow: inset 0 2px 0 var(--acc)`), `aria-current="page"`.

### Chat (mesh)

- Incoming: left, max 80% width, `--s1` bg, `1px --line`. Meta line mono 10 px: sender (bold `--fg`) + hops + time.
- Outgoing: right, `--acc-soft` bg, `1px --acc`. Delivery state bottom right: `SENT` → `ACK` (check, `--ok`) → `FAILED` (octagon, `--crit`, with retry).
- Composer: 48 px input on `--s2` with a byte counter (`0/200 B`, mono), 48 px amber send button. Block sending past the payload limit and say why.
- Date dividers: label centered between 1 px lines (`TODAY · 14:00Z`).

### Map

- Map background `--map`; contour lines `--line2` (index contours 1.75 px); grid `--line`; water `--info`; roads `--fg3`.
- Own position: amber heading arrow + accuracy circle (`--acc-soft` fill, `--acc` stroke). Only the user's position and active route are amber.
- Waypoints: diamond (route target, amber stroke) or square (saved place, info stroke) with mono uppercase label and a halo (`paint-order: stroke`, stroke `--map`).
- Alerts (SOS nodes): crit octagon with dashed ring.
- Controls: right column of 44 px icon buttons (panel, zoom group, compass, layer switches such as mesh nodes), a 52 px amber locate button above the bottom sheet, scale bar bottom left.
- Show a cache badge (`TILES CACHED · <REGION>`) so users know what works offline.
- Night map style must be dark; never show a bright map in `.t-dark`.

---

## 8. Content and copy

- Short, direct, action first. Sentence case for body text, UPPERCASE for buttons, labels and badges.
- Say what works offline and what does not. Example: "Running offline. Content last synced 3 days ago."
- Always give the age of data (`3 MIN AGO`, `2026-09`).
- Errors: what happened + what to do. "Outside the band for region EU_868." not "Invalid input".
- No jokes, no exclamation marks, no emoji.
- Units: metric by default (m, km, km/h), user can switch. Bearings as three digits with degree sign (`038°`).

---

## 9. Accessibility

- Semantic HTML: real `<button>`, `<a href>`, `<input>` + `<label>`, `<nav>`, `<main>`, `<header>`. Never click handlers on `<div>`.
- Visible focus everywhere: `outline: 2px solid var(--acc); outline-offset: 2px` on `:focus-visible`.
- Live regions for incoming messages and alerts (`aria-live="polite"`; critical SOS uses `role="alert"`).
- Support 200% text zoom without horizontal scrolling on phones.
- Usable with gloves: no gestures without a button alternative, no tiny close icons.
- Test both themes for contrast after any token change.

---

## 10. Performance and offline

- Ship as a PWA or local web app served from the Outpost node. Precache app shell, fonts and icons with a service worker.
- Show stale data with its age rather than an empty screen.
- Queue outgoing actions (messages, waypoints) locally and show their state (`QUEUED`, `SENT`, `ACK`).
- Keep bundles small; avoid heavy UI frameworks for simple modules. No external runtime dependencies.
- Pause expensive work (map rendering, polling) when the app is hidden or in low-power mode.
- Low-power mode: dim UI, stop animations (`html.motion-off`), reduce GNSS and sync polling. Expose it as a global setting.
- Motion is CSS only (no animation library, no requestAnimationFrame loops); browsers pause it in hidden tabs.

---

## 11. Adding a new module

1. Pick a module number and name (`Module 04 · <Name>`), an icon from the 24 px set (or a new one in the same style) and a one-line mono status for its Hub tile.
2. Reuse the app frame from section 6: status strip, header, optional context bar, content, bottom nav.
3. Build only from the components in section 7. If you need a new one, define it with tokens only, give it dark and light states, and document it below.
4. Define the module's offline story: what is cached, how stale data is shown, how actions are queued.
5. Check: both themes, 44 px targets, status never color-only, no network requests at runtime.

### Review checklist

- [ ] No hard-coded colors, fonts or spacing
- [ ] Works in `.t-dark` and `.t-light`
- [ ] Status strip present and correct
- [ ] One amber primary action per view
- [ ] Every status has icon + label + color
- [ ] All targets ≥ 44 px, primary action 56 px
- [ ] Numbers in mono with tabular figures; times in UTC `Z`
- [ ] Keyboard and screen reader usable; visible focus
- [ ] Zero external network requests
- [ ] Data age and offline state are visible

---

## 12. Reference

The visual reference (foundations, components, Hub, Maps, Library and Mesh screens) lives in the Outpost design canvas. When the canvas and this file disagree, this file wins; update both together.

## Changelog

- 0.1 (2026-11): initial tokens, components, app frame, Hub / Maps / Library / Mesh patterns.
- 0.2 (2026-11): shared implementation in `packages/ui` (see `packages/ui/README.md`). Additions:
  - **Dialog** (`.dialog`): modal sheet on `<dialog>`, `--s1` with `1px --line2`, head / body / actions split by 1 px lines.
  - **Table** (`.table`): dense mono table for system data, header in label style, 1 px row lines.
  - **Key/value list** (`.kv`): label-style keys, mono values; used in popups and detail panels.
  - **Map markers** (`.mk`): DOM markers with a shape (`.mk-shape`: square = saved place / node, `.mk-diamond` = route target, `.mk-own` = own position, `.mk-sos`) and a mono uppercase label with a `--map` halo; `.is-stale` dims old data.
  - **Status strip items** are shown only when the app has a source for them. A Raspberry Pi without GNSS or battery shows link state and UTC time rather than invented values.
  - **Module nav**: Maps, Mesh map, Mesh, Library, System (`MODULES` in `ui/outpost.js`), linking to each app on the same hostname at its default port. There is no Hub app yet. Each module has a number (Maps 01, Mesh map 02, Mesh 03, Library 04, System 05); the header label is `moduleLabel(id)` → `Module 03 · Mesh`, filled into `[data-module-label]` by `frame()`. The header H1 is the current view or title, and every header has the theme toggle.
  - **Status strip link rule**, the same in every app: the LED shows the app's link to its own local data source, written `<SOURCE> · <STATE>`. ok = connected / loaded (`LOCAL · 3 REGIONS`, `MESH · LIVE`, `RADIO · LINKED`, `LOCAL · LIVE`, `LOCAL · 12 BOOKS`); cau = connecting, reconnecting or stale (`LOCAL · CONNECTING`, the default); crit = failed, with a short reason (`LOCAL · NO ANSWER`, `RADIO · PI UNREACHABLE`). Other facts go in the strip items.
  - **Theme boot** (`ui/theme-boot.js`): a classic script in `<head>`, before the CSS, applies the stored theme before first paint. Bundled apps inline the same snippet.
  - **OK banner** (`.banner-ok`): `--ok-soft` bg, `1px --ok` border, check icon, for all-clear summaries. Banners take an optional trailing button; a 44 px dismiss icon tucks into the padding.
  - **Progress tones** (`.progress.is-cau/.is-crit`, `progress(el, ratio, cells, tone)`): a bar lit `--cau` or `--crit`, e.g. a nearly full disk.
  - **Static row** (`.row.static`): list row that is information only (logs, events), no hover. **Table wrap** (`.table-wrap`) scrolls wide tables sideways.
  - **Row extras**: `.row-mk` (saved-place square as the list lead, same shape as the map marker); `.row-actions` (a row plus trailing 44 px icon buttons such as export and delete).
  - **Status word** (`.status` > `.led` + word): LED plus uppercase mono label, so status is never colour alone in rows and popups.
  - **Map stage and panel** (`.map-stage`, `.map-view`, `.map-panel`, `.map-panel-head` [`.is-tabs`], `.map-panel-title`, `.map-panel-body` [`.flush`], `.map-panel-actions`): from 720 px a 360 px `--s1` side panel next to the map (side by DOM order), below that a bottom sheet under the map (max 55 % height), so the locate button stays above the sheet.
  - **Map extras**: `.map-compass` (the compass icon rotates by `--map-bearing` so it points north), `.map-badge-text` (cache badge truncates with an ellipsis), round node markers `.mk-node` with age by stroke (`.is-fresh` `--ok`, `.is-old` `--cau`, `.is-stale` `--fg3` and dimmed; the label also states the age), popup content `.map-popup` whose head clears the 44 px close button.
  - **Icons** `fit` (frame all) and `list` (show the list panel).
- 0.3 (2026-11): outpost becomes one app; every module is served under a path on one port.
  - **Module nav** is path based: Home (`/`), Maps (`/maps/`), Mesh map (`/mesh-map/`), Mesh (`/mesh/`), Library (`/library/`), System (`/system/`). `frame()` draws the built-in list right away, then redraws it from core's `/api/modules` (installed modules only, from the module manifests), so a new module needs no change in `packages/ui`. Home has no number; its header label is just "Home". A module that is installed but stopped stays in the nav, dimmed (`.nav-item.is-off`, `--fg3`), and leads to its START on the home page.
  - **Hub** (home page, core): the module tiles from 0.1 (`a.tile`), each with a state badge, plus a card of `.switch-row`s to switch modules on and off. Opening a stopped or missing module shows an info banner there with its START button.
- 0.4 (2026-11): one web app. Every screen is a route of `apps/web` (React, TanStack Router), served by core at `/`; modules have no UI of their own any more.
  - **React bindings** live in `apps/web/src/ui/outpost.tsx` (`Icon`, `Badge`, `Banner`, `HoldButton`, `Progress`, `ThemeToggle`, `useTheme`) and `apps/web/src/app/` (`Screen` = header + content + nav, `StripProvider`/`useStripLink`/`useStripItems`, `Nav`). The markup and classes are the package's; nothing is restyled.
  - **Status strip** stays mounted across screens (one clock); each screen sets its link and items while it is shown.
  - **Module nav** is rendered by React from `/api/modules` with router links (no page reloads); same classes, same order, same dimmed `.is-off` state.
  - **Module gate**: a module's route shows, instead of its screen, an info banner with its START button when it is stopped, and says how to install or configure it otherwise (it was on the home page in 0.3).
- 0.5 (2026-11): Logs module (`/logs`, served by core, number 06).
  - **Icon** `logs` (terminal frame with prompt and cursor line), the Logs module's nav and tile icon.
  - **Log lines** (`apps/web/src/features/logs/logs.css`, tokens only): mono 12 px lines in a scrolling `--bg` box with a `--line` border; each line is UTC time (`HH:MM:SS.mmm`, `--fg3`), the level written out in uppercase, then `[context]` (`--fg2`) and the message (pre-wrapped). Warnings get a 2 px `--cau` left edge, a caution icon and a `--cau` level word; errors and fatal a 2 px `--crit` edge, `--crit-soft` background, a critical icon and a `--crit` level word; debug and verbose messages are `--fg2`. The level is always written, so it is never colour alone. The view sticks to the newest line unless the user scrolled up.
- 0.6 (2026-11): motion and illustrations; the look becomes "field terminal after the collapse" (section 2). Rules 7 and 8 rewritten: motion and art are allowed when they serve the signal.
  - **Tokens**: `--glow-acc/ok/info/crit` (dark only, `transparent` in light), `--scan`, `--dur-fast/--dur/--dur-slow`, `--ease-out`, `--ease-snap`.
  - **Motion** (`packages/ui/motion.css`, imported by `outpost.css`): screen content rises in a beat apart; the header's bottom line sweeps amber once and the H1 locks in with a short glitch (slices + `--info`/`--crit` colour split); the strip LED pings while live (ok), blinks while connecting (cau), pings fast on failure (crit), and any `.led.is-live` does the same; nav icons lift on hover, the current one glows and flickers on; buttons press down, the primary one glows and a band of light crosses it on hover, icon buttons tilt; switches snap with an overshoot and glow when on; badges pop in, `.badge.is-busy` (starting, stopping) crawls with hazard stripes; the progress cell being filled blinks; rows show a `--line2` edge on hover; banners reveal from the left, critical ones pulse their border three times; toasts rise; dialogs open like a CRT (a line, then the picture); empty states get one info scan bar; tiles close corner brackets in on hover/focus, glow their icon and colour-split their name, and hub tiles power on one after another. Static scanlines (`--scan`) cover the frame.
  - **Illustrations** (`packages/ui/illustrations.js` + `illustrations.css`): line art in the icon style, stroked by token class (`l` far / `f` near / `a` amber = own post and route only / `i` / `o` / `c`, `g` = filled with `--il-bg` to hide what is behind), animated by class (`pulse`, `blink`, `march`, `draw`, `type`, `scan`, `float`, `flicker`, `spin`). Scenes: `hero` (the outpost at dusk: ruins, a slit sun, the mast with signal arcs, mesh nodes linked over the ruins, a drone, 960 x 220), one per module (`maps`, `library`/`knowledge`, `mesh`, `mesh-map`, `system`, `logs`), `lost` (signal lost), `generic` (mast). `illustration(name)` returns the markup; React: `Illustration` in `apps/web/src/ui/outpost.tsx`. `.il.is-off` greys a scene out and stops it (module not running). Always decorative (`aria-hidden`), never carries information.
  - **Placements**: `.hero` on Home (scene + what is running), `.tile-art` (the module's scene, faint, behind the tile text), `.gate-art` above a module gate's banner (not installed / not running) and on "not found", `.empty .il` instead of the 40 px icon in empty states.
  - **Boot screen** (`.boot`, apps/web `Boot`): the terminal powers up once per browser session: mast, glitching name, four status lines. Fades by itself after ~1.5 s, ends on tap or key, skipped with reduced motion or `motion-off`. Its lines only state facts the app knows.
- 0.7 (2026-11): Info module (`/info`, served by core, number 07): the project documentation, rendered from `docs/*.md`.
  - **Document** (`.doc`): long-form text rendered from Markdown, max 76 ch. H1 display 28 px uppercase, its first paragraph as a lead in `--fg2`; H2 display 21 px with a 1 px `--line` rule above; H3 display 17 px; H4 in label style. Links `--acc-ink`, underlined. Inline code mono on `--s2` with a `--line` border; code blocks on `--s2` with a 2 px `--line2` left edge. Blockquotes as an info note (`--info-soft`, `--info` border). Tables use `.table` in `.table-wrap`, in body font. A link to a project file outside the docs (`.doc-file`) is plain `--fg2` text with a dashed underline, since the app can't open it. Prose is the one place siblings are spaced with margins (`.doc > * + *`), because the Markdown decides the children.
  - **Icon** `manual` (a bound field manual with text lines), the Info module's nav and tile icon. **Illustration** `info`: the open field manual with the mast's schematic and a bookmark.
- 0.8 (2026-11): Mesh map merged into Maps. The Meshtastic nodes are a layer of the offline map, not a module of their own.
  - **Layer switch**: an icon button `nodes` in the map's control column (`.map-ctrls`, `aria-pressed` while shown), only when Mesh is installed. The choice is remembered per browser.
  - **Nodes tab** in the map panel next to Regions and Places while the layer is shown: one row per positioned node (monogram, name, heard/hops, age LED), "Show all nodes" fits them in view. Node markers (`.mk-node`, `.is-fresh/.is-old/.is-stale`) and the node popup (`.map-popup` + `.kv`) are unchanged.
  - **Module numbers**: Maps 01, Mesh 02, Library 03, System 04, Logs 05, Info 06. The `mesh-map` illustration is gone.
- 0.9 (2026-11): one status strip for every screen, with the host vitals. It replaces the per-screen link and items of 0.2 and 0.4: the LED is the link to core (`CORE · LIVE` ok, `CORE · CONNECTING` cau, `CORE · OFFLINE` crit), then the vitals, then UTC. A screen's own state (its data source, counts, GNSS, download or sync progress) moves to its context line or a banner.
  - **Strip host group** (`.strip-host`, `strip.setHost()`): `TEMP`, `VOLT`, `CPU`, `MEM`, `DISK` between the link and the screen's items, most important first. It takes the room that is left and shows whole items only (the rest wraps onto a hidden line). Below 720 px it becomes a second strip row of 24 px with a 1 px `--line` above, items spread across it, letter-spacing 0.04em.
  - **Item tone**: a strip item's value may be `.is-cau` (`--cau`) or `.is-crit` (`--crit`), using the System screen's thresholds.
  - **Scrolling dialog** (`.dialog.dialog-scroll`): for long lists (e.g. every power event); the head and actions stay in place, only `.dialog-body` scrolls.
