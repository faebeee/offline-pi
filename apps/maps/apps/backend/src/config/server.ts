export const PORT = Number(process.env.PORT ?? 8080);
export const HOST = process.env.HOST ?? "127.0.0.1";

/** Tiles, glyphs and sprites are content-addressed by region and never change. */
export const IMMUTABLE = "public, max-age=604800, immutable";
