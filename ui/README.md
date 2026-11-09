# ui: the Outpost UI package

One UI system for every app in this repo, implementing [`DESIGN.md`](../DESIGN.md).
Plain CSS and an ES module with no dependencies, so React and vanilla apps
use the same files. Nothing here loads from the network.

| File | |
|---|---|
| `tokens.css` | Design tokens, verbatim from `DESIGN.md` section 3 |
| `fonts.css`, `fonts/` | Chakra Petch, IBM Plex Sans, JetBrains Mono (WOFF2, latin + latin-ext, SIL OFL 1.1) |
| `outpost.css` | Base, app frame and components. Imports `tokens.css` and `fonts.css`; load only this one |
| `icons.svg` | Icon sprite (24 px, stroke 1.75, square caps) |
| `outpost.js` | Theme, status strip, module nav, formatters, toast, hold-to-confirm, indicators |
| `theme-boot.js` | Classic script for `<head>`: applies the stored theme before first paint |
| `outpost.d.ts` | Types for `outpost.js` |
| `sync.sh` | Copies the package into an app before it builds |

## How apps get it

Each app builds in its own directory (its container build context), so it
can't reach `../../ui` at build time. Instead the app's `install.sh` and
`start.sh` copy the package into the app before building:

```sh
"$SCRIPT_DIR/../../ui/sync.sh" "$SCRIPT_DIR/public/ui"
```

The copy is gitignored and the app's `Dockerfile` fails fast when it is
missing. Static apps serve it at `/ui/`; Vite apps sync it into `src/outpost-ui/`
and import it, so it gets bundled. Change files here, never the copies.

## The frame

Every screen (DESIGN.md section 6):

```html
<html lang="en" class="t-dark">
<script src="/ui/theme-boot.js"></script>       <!-- before the CSS: no theme flash -->
<link rel="stylesheet" href="/ui/outpost.css">
<body>
  <div class="frame">
    <div data-strip></div>                      <!-- status strip -->
    <header class="header">
      <div class="header-title">
        <span class="label" data-module-label>Module 03 · Mesh</span>
        <h1 class="h1">Channels</h1>              <!-- the current view / title -->
      </div>
      <div class="header-actions">
        <button data-theme-toggle></button>      <!-- 44 px sun/moon -->
      </div>
    </header>
    <div class="context">EU_868 · LONGFAST · 3 NODES</div>   <!-- optional -->
    <div class="frame-body">
      <main class="content grid-bg">…</main>     <!-- .content.bleed for maps -->
      <nav data-nav></nav>                        <!-- bottom nav / left rail -->
    </div>
  </div>
  <script type="module">
    import { frame } from "/ui/outpost.js";
    const { strip } = frame("mesh");             // module id, see MODULES
    strip.setLink("ok", "RADIO · LINKED");
    strip.setItems([{ label: "BAT", value: "78%" }]);
  </script>
```

`frame()` applies the stored theme (`outpost.theme`, default dark), builds the
strip with a UTC clock, fills the module nav (links to the other apps on the
same hostname at their default ports), wires the theme toggle and writes
`moduleLabel(id)` ("Module 03 · Mesh", numbered by `MODULES[].num`) into every
`[data-module-label]`. Listen for `outpost:theme` on `window` to react to theme
changes (e.g. swap the map style).

Vite apps bundle the package, so `/ui/theme-boot.js` has no URL before the
build: they inline the same snippet in a `<script>` in `index.html`. The
Library page (one self-contained file) inlines the file at image build.

### Status strip link

The same rule in every app: the LED shows the app's link to **its own local
data source**, written `<SOURCE> · <STATE>`.

| LED | Meaning | Examples |
|---|---|---|
| ok | connected / loaded | `LOCAL · 3 REGIONS`, `MESH · LIVE`, `RADIO · LINKED`, `LOCAL · LIVE`, `LOCAL · 12 BOOKS` |
| cau | connecting, reconnecting or stale | `LOCAL · CONNECTING` (the default until the app says otherwise), `RADIO · CONNECTING` |
| crit | failed, with a short reason | `LOCAL · NO ANSWER`, `MESH · ACCESS BLOCKED`, `RADIO · PI UNREACHABLE` |

Other facts (GNSS, battery, counts) go in `strip.setItems()`, never in the
link text.

## React

The package works on plain DOM; React apps wrap it thinly. `apps/maps`'s
`apps/frontend/src/ui.tsx` is the example.

- Call `frame()` **once**, from an effect on the frame's root element, and
  guard it with a ref, not state: StrictMode runs effects twice before state
  lands, and `frame()` binds listeners and starts the clock. Keep the strip
  in state and drive it from an effect.

  ```tsx
  const shell = useRef<HTMLDivElement>(null);
  const framed = useRef(false);
  const [strip, setStrip] = useState<Strip | null>(null);
  useEffect(() => {
    if (!shell.current || framed.current) return;
    framed.current = true;
    setStrip(frame("maps", shell.current).strip);
  }, []);
  ```
- `holdToConfirm()` and `themeToggle()` take over a button's children. Render
  the button **empty** and bind it in an effect (`HoldButton` in `ui.tsx`;
  the theme toggle is just `<button data-theme-toggle />`, wired by
  `frame()`). Render text that `frame()` fills (`data-module-label`) with the
  same value, e.g. `{moduleLabel("maps")}`, so React and the package agree.
- Re-render-safe helpers: `Icon` (uses `iconHref()`), `Badge`, `Banner`,
  `Progress` (calls `progress()` in an effect), `useTheme()` (follows
  `outpost:theme`).

## Components (classes)

| Component | Classes |
|---|---|
| Buttons | `.btn` + `.btn-primary` (56, one per view) / `.btn-ghost` / `.btn-crit` / `.btn-icon` (44 square, `aria-pressed` = active) / `.btn-lg` / `.btn-sm` / `.btn-block`; disabled via `disabled` |
| Hold to confirm | `<button>` + `holdToConfirm(btn, fn)` |
| Inputs | `.field` > `label.label` + `.input` / `.select` / `.textarea` + `.help`; error: `aria-invalid="true"` + `.field.is-error` + `.field-error`; `.search` wrapper |
| Switch | `button.switch[role=switch][aria-checked]` in `.switch-row` |
| Segmented | `.seg` > `button[aria-pressed]` |
| Chips | `.chips` > `button.chip[aria-pressed]` |
| Checkbox | `label.check` > `input[type=checkbox]` |
| Badges | `.badge` + `.badge-ok/-info/-cau/-crit/-acc/-sos`, or `badge(state, text)` (icon + word) |
| LED | `.led` + `.led-ok/-info/-cau/-crit/-off`, `.led-sq` (strip), `.led-lg` |
| Readouts | `.readout` > `.label` + `.readout-value` (`.readout-unit`) + `.cells`/`.bars`; `powerCells()`, `signalBars()` |
| Progress / storage | `.progress-head` + `progress(el, ratio, cells, tone)` (tone `"cau"`/`"crit"` = `.progress.is-cau/.is-crit`); `.stack` > `i.maps/.library/.mesh/.other` + `.legend` |
| Banners | `.banner` + `.banner-info/-ok/-cau/-crit` > `.i` + `.banner-text` > `.banner-title` + `.banner-body`, optional trailing `.btn` (a `.btn-icon` dismiss tucks into the padding) |
| Toast | `toast(message, { action, onAction })` |
| Empty state | `.empty` > `.i` + `.empty-title` + `p` |
| Cards | `.card` (`.card-head`), `.cellrow` (cells split by lines), `.kv` (`dl`) |
| Lists | `ul.list` > `li` > `.row` (`a`/`button`) > `.led`/`.monogram`/`.row-mk` (saved-place square) + `.row-main` (`.row-title`, `.row-meta`) + `.row-value` + chevron icon; `.row.static` (information only); `.row-actions` > `.row` + trailing `.btn-icon`s |
| Status word | `.status` > `.led` + word (LED + uppercase mono label, e.g. in a `.row-value` or popup) |
| Tabs | `.tabs[role=tablist]` > `button.tab[role=tab][aria-selected]` |
| Tiles | `a.tile` > icon + `.tile-name` + `.label` |
| Dialog | `dialog.dialog` > `.dialog-head` + `.dialog-body` + `.dialog-actions` |
| Table | `table.table` (`.num` for numbers), in `.table-wrap` to scroll sideways |
| Chat | `.chat` > `.msg` (`.msg-out`) > `.msg-meta` + `.msg-text` + `.msg-state` (`.is-ok`/`.is-crit`); `.divider`; `.composer` + `.counter` |
| Map stage | `.map-stage` > `aside.map-panel` (`.map-panel-head` [`.is-tabs`] > `.map-panel-title` / `.tabs` + `.btn-icon`; `.map-panel-body` [`.flush`]; `.map-panel-actions`) + `.map-view`. Side panel from 720 px (left or right by DOM order), bottom sheet under the map below; hide with `[hidden]` and call `map.resize()` |
| Map | `.map-view` > `.map-canvas`, `.map-ctrls` (`.group`, `.map-compass` rotated by `--map-bearing`), `.map-locate`, `.map-badge` > `.map-badge-text` (ellipsis); markers `.mk` > `.mk-shape` + `.mk-label` with `.mk-diamond` / `.mk-own` / `.mk-sos` / `.mk-node` (round) and age `.is-fresh` / `.is-old` / `.is-stale`; popup content `.map-popup` > `.map-popup-head` (clears the close button) > `.map-popup-title` |
| Motifs | `.grid-bg`, `.brackets`, `.chamfer`, `.hatch` |
| Type | `.display`, `.h1`, `.h2`, `.label`, `.mono`, `.data`, `.body-sm`, `.help`, `.fg2`, `.fg3`, `.acc` |
| Icons | `icon(name)` / `iconHtml(name)`, class `.i` (`.i-sm`, `.i-xs`, `.i-lg`) |

Helpers: `moduleLabel(id)`, `badgeHtml(state, text, cls)` and
`escapeHtml(text)` for HTML templates, `setSprite(url)` (`""` when the sprite
is inlined in the page).

Formatters: `utcTime` (`14:32Z`), `utcClock` (`14:32:05Z`), `utcDateTime`, `utcDate`, `coords`
(`47.37690 N · 008.54170 E`), `ago` (`3 MIN AGO`), `bytes`, `bearing`
(`038°`), `distance`.

Icons in `icons.svg`: map, library, mesh, nodes, hub, system, locate,
waypoint, layers, search, send, download, plus, minus, back, chevron, close,
trash, edit, external, fit, list, refresh, compass, message, sun, moon, battery, signal,
thermo, storage, power, and the fixed status shapes info, ok, caution,
critical, offline.

## Adding to it

Need something that isn't here? Build it with tokens only, give it dark and
light states, add it to `outpost.css` (or `outpost.js`), list it above and in
the `DESIGN.md` changelog. Then re-run each app's `./start.sh` to pick it up.
