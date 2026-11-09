/** Upstream sources. Only touched by the CLI commands, never by the server. */
export const UPSTREAM = {
  pmtilesVersion: "1.31.2",
  pmtilesRelease: (version: string, asset: string) =>
    `https://github.com/protomaps/go-pmtiles/releases/download/v${version}/${asset}`,
  basemapsAssets: "https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.tar.gz",
  geofabrikIndex: "https://download.geofabrik.de/index-v1.json",
  nominatim: "https://nominatim.openstreetmap.org/search",
  build: (date: string) => `https://build.protomaps.com/${date}.pmtiles`,
  userAgent: "offline-maps/0.1 (self-hosted offline map tiles)",
} as const;
