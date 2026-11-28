// The landing page's few behaviours, on top of the static HTML (which reads
// fine without them): the Outpost icons and line art, the theme button, copy
// buttons for the commands and the version from the root package.json.
import "@outpost/ui/outpost.css";
import { illustration } from "@outpost/ui/illustrations.js";
import { icon, initTheme, themeToggle } from "@outpost/ui/outpost.js";
import pkg from "../../../package.json";
import "./landing.css";

initTheme();

// <i data-icon="map"> -> the sprite icon
for (const el of document.querySelectorAll<HTMLElement>("[data-icon]")) {
  el.replaceWith(icon(el.dataset.icon!));
}

// <div data-il="hero"> -> the line-art scene (decorative, our own markup)
for (const el of document.querySelectorAll<HTMLElement>("[data-il]")) {
  el.innerHTML = illustration(el.dataset.il!);
  el.setAttribute("aria-hidden", "true");
}

const toggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
if (toggle) themeToggle(toggle);

for (const el of document.querySelectorAll<HTMLElement>("[data-version]")) {
  el.textContent = pkg.version;
}

// a copy button next to every command
for (const code of document.querySelectorAll<HTMLElement>("code[data-copy]")) {
  const pre = code.parentElement!;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-sm lp-copy";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy: ${code.textContent}`);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      button.textContent = "Copied";
    } catch {
      // no clipboard (plain http): select it for Ctrl+C instead
      const range = document.createRange();
      range.selectNodeContents(code);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      button.textContent = "Selected";
    }
    setTimeout(() => (button.textContent = "Copy"), 1500);
  });
  pre.classList.add("has-copy");
  pre.after(button);
}
