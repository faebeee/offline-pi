# mesh-map: a static page (MapLibre + pmtiles, built with Vite) and a
# dependency-free Node server (server.mjs) that serves it plus apps/maps'
# downloaded map data, mounted read-only.

# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ src/
RUN npm run build

# -------------------------------------------------------------- runtime ---
FROM node:22-slim
WORKDIR /app
# server.mjs has no dependencies, so no node_modules in the runtime image
COPY server.mjs ./
COPY --from=build /app/dist dist

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged), so it can read apps/maps' files whatever their owner and
# mode (same approach as apps/mesh). The mounts are read-only anyway.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8086 MAPS_DATA=/maps/data MAPS_ASSETS=/maps/assets
EXPOSE 8086
CMD ["node", "server.mjs"]
