# Design system

Every screen of outpost uses **Outpost**, one design system for
offline-first apps used in emergencies and off-grid. The look: a field
terminal that survived the collapse. Tactical, readable, never noisy.

| What | Where |
|---|---|
| The spec (rules, tokens, components, changelog) | `DESIGN.md` in the project root |
| The implementation | `packages/ui` (`@outpost/ui`), described in `packages/ui/README.md` |
| React bindings | `apps/web/src/ui/outpost.tsx` and `apps/web/src/app/` |

`DESIGN.md` is the source of truth. This page is a summary; read the spec
before you build a screen or a component.

## Rules

The non-negotiable rules from `DESIGN.md`, in short:

1. **Offline is the default.** No runtime requests to CDNs, font services,
   analytics or icon services. Everything ships with the app.
2. **Tokens only.** Never hard-code a colour, font or spacing value.
3. **Every theme works.** Every screen is tested in `.t-dark` (default),
   `.t-light` and the neon themes.
4. **Never colour alone.** Every status is colour plus icon shape plus a
   written label.
5. **Touch targets of at least 44 x 44 px**; the main action is 56 px tall.
6. **One primary (amber) action per view.** Amber is for the main action,
   the user's own position, the active nav item and focus rings.
7. **Motion and art serve the signal.** Motion follows a state or screen
   change; loops only in illustrations and live indicators. Glow only on
   live or active elements, in the dark theme.
8. **Respect reduced motion** (`prefers-reduced-motion`, and
   `html.motion-off` for low power): everything stops.
9. **Status is always visible**: every screen shows the status strip.
10. **Text contrast of at least 4.5:1** in every theme.

## Tokens and themes

Tokens are CSS custom properties in `packages/ui/tokens.css`, copied from
`DESIGN.md` section 3.

| Group | Tokens |
|---|---|
| Surfaces | `--bg` (ground), `--s1` (cards, header, nav), `--s2` (inputs, nested panels), `--s3` (tracks, disabled) |
| Lines | `--line` (dividers), `--line2` (control borders) |
| Text | `--fg`, `--fg2` (secondary), `--fg3` (labels) |
| Accent | `--acc` (fills), `--acc-ink` (amber text), `--on-acc`, `--acc-soft` |
| Status | `--info`, `--ok`, `--cau`, `--crit`, each with `-soft`; `--on-crit` |
| Motifs | `--grid`, `--map`, `--scan` (scanlines) |
| Glow | `--glow-acc`, `--glow-ok`, `--glow-info`, `--glow-crit` (transparent in the light theme) |
| Motion | `--dur-fast` (120 ms), `--dur`, `--dur-slow`, `--ease-out`, `--ease-snap` |

The theme is a class on `<html>`: `.t-dark` by default, `.t-light` for day.
The neon themes (`neon`, `netrun`, `toxic`) add their own class next to
`.t-dark` (`<html class="t-dark t-neon">`), which redefines every colour
token; `.t-dark` stays, so color-scheme and the dark map still apply. The
list is `THEMES` in `outpost.js` (`id`, `label`, `mode`, `hint`);
`getTheme()` returns the id, `getThemeMode()` `"dark"` or `"light"`. The
choice is stored in `localStorage` (`outpost.theme`) and applied before the
first paint (`theme-boot.js`, inlined in `apps/web/index.html`), so a
stored theme doesn't flash. A new theme is one token block in `tokens.css`,
one `THEMES` entry and its id in both boot snippets; components don't
change.

Type: Chakra Petch for display, headings and buttons (uppercase), IBM Plex
Sans for body text, JetBrains Mono for labels and every number, time, ID and
coordinate (tabular figures). All three are self-hosted. Times are UTC with
a `Z` suffix (`14:32Z`).

## Components

The package provides plain CSS classes and a small ES module
(`outpost.js`), so React and plain pages share them. The main groups:

- **Frame**: status strip, header, context line, content, module nav
  (bottom bar on phones, left rail on wide screens).
- **Controls**: buttons (`.btn-primary`, `.btn-ghost`, `.btn-crit`,
  `.btn-icon`), hold to confirm, inputs, switch, segmented control, chips,
  checkbox, tabs.
- **Status**: badges, LEDs, status word, banners (info, ok, caution,
  critical), toast, empty state, progress.
- **Data**: cards, readouts, key/value lists, lists and rows, tables, chat.
- **Maps**: map stage and side panel or bottom sheet, map controls, markers
  for places, nodes and the own position, popups.
- **Icons**: a 24 px stroke sprite (`icons.svg`) with fixed status shapes
  (info circle, check, caution triangle, critical octagon, offline arc).

The full list with classes is in `packages/ui/README.md`.

## Motion and illustrations

Version 0.6 of the spec added motion and line art:

- **Motion** (`packages/ui/motion.css`): screen content rises in; the
  header line sweeps once and the title locks in with a short glitch; the
  strip LED pings while live, blinks while connecting; buttons press, the
  primary one glows; switches snap; busy badges crawl with hazard stripes;
  dialogs open like a CRT; tiles close corner brackets on hover.
- **Illustrations** (`packages/ui/illustrations.js` and `.css`): line-art
  scenes in the icon style, coloured by tokens and animated by CSS. A hero
  scene for Home, one scene per module, `lost` (signal lost) and `generic`.
  In React: `<Illustration name="maps" />`. Always decorative, never
  carrying information. `.is-off` greys a scene out (module not running).
- **Boot screen**: the terminal powers up once per browser session, ends on
  tap or key and is skipped with reduced motion.

Motion is CSS only: no animation library, no animation loops in script.

## Changing the design system

1. Build the new component with tokens only, with dark and light states.
2. Add it to `packages/ui/outpost.css` (or `outpost.js`), and a React
   wrapper in `apps/web/src/ui/outpost.tsx` if it needs one.
3. List it in `packages/ui/README.md` and add an entry to the `DESIGN.md`
   changelog.
4. Check it against the review checklist in `DESIGN.md` section 11.

Never restyle a component inside one feature's CSS.
