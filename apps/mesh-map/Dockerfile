# mesh-map: a static page (MapLibre + pmtiles, built with Vite) and a
# dependency-free Node server (server.mjs) that serves it plus the Maps module's
# downloaded map data, mounted read-only.
#
# Built with the repo root as context (compose.yml): `turbo prune` cuts the
# monorepo down to mesh-map and @offline-pi/ui, which Vite bundles.

# ---------------------------------------------------------------- prune ---
FROM node:22-slim AS prune
ARG TURBO_VERSION=2.11.10
RUN npm install -g "turbo@${TURBO_VERSION}"
WORKDIR /repo
COPY . .
RUN turbo prune @offline-pi/mesh-map --docker

# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY --from=prune /repo/out/json/ ./
RUN npm ci --ignore-scripts
COPY --from=prune /repo/out/full/ ./
RUN npx turbo run build --filter=@offline-pi/mesh-map

# -------------------------------------------------------------- runtime ---
FROM node:22-slim
WORKDIR /app
# server.mjs has no dependencies, so no node_modules in the runtime image
COPY apps/mesh-map/server.mjs ./
COPY --from=build /app/apps/mesh-map/dist dist

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged), so it can read the Maps module's files whatever their owner and
# mode (same approach as mesh). The mounts are read-only anyway.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8086 MAPS_DATA=/maps/data MAPS_ASSETS=/maps/assets
EXPOSE 8086
CMD ["node", "server.mjs"]
