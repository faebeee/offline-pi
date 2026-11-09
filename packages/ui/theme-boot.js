// theme-boot.js: apply the stored theme before first paint, so a user who
// picked the day theme never sees a dark flash. Load it as a classic,
// blocking script in <head>, before outpost.css: src="/ui/theme-boot.js".
// Vite apps inline the same snippet in index.html instead, and the Library
// page inlines this file (so it must never contain a closing script tag).
(function () {
  var t = null;
  try { t = localStorage.getItem("outpost.theme"); } catch (e) {}
  document.documentElement.className = (document.documentElement.className.replace(/\bt-(dark|light)\b/g, "") + " t-" + (t === "light" ? "light" : "dark")).trim();
})();
