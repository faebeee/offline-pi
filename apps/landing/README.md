# landing

outpost's landing page: one static page about the project, what it is for,
the modules, how it works, how to install it and its security model. It is
for people who don't have outpost yet, so it is **not part of the app on
the Pi**: no `module.json`, not in any image, not served by core.

```bash
npm run dev -w @outpost/landing      # http://localhost:5173
npm run build -w @outpost/landing    # static files in apps/landing/dist/
```

- Plain HTML (`index.html`) that reads fine without JavaScript;
  `src/main.ts` only adds the Outpost icons and line art, the theme button
  (it cycles through every Outpost theme), copy buttons for the commands
  and the version from the root `package.json`.
- Built on the design system (`@outpost/ui`: tokens, self-hosted fonts,
  icons, illustrations, components); `src/landing.css` is layout only,
  tokens only, so every theme works.
- `base: "./"` (vite.config.ts): `dist/` works from any folder or sub path,
  e.g. GitHub Pages at `/<repo>/`. No request leaves the page.
- Keep it in line with the app: when a module, the install flow or the
  security model changes, update the matching section here too.
