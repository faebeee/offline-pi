# Built with the repo root as context (compose.yml): `turbo prune` cuts the
# monorepo down to the maps backend and the packages it depends on
# (@offline-pi/maps-shared). Its UI is the web app (apps/web), served by core.

# ---------------------------------------------------------------- prune ---
FROM node:22-slim AS prune
ARG TURBO_VERSION=2.11.10
RUN npm install -g "turbo@${TURBO_VERSION}"
WORKDIR /repo
COPY . .
RUN turbo prune @offline-pi/maps-backend --docker

# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY --from=prune /repo/out/json/ ./
# better-sqlite3 ships a binding.gyp, and npm's default for that is `node-gyp
# rebuild` even though the package has no install script. This image has no
# compiler, and it does not need one: the package bundles N-API prebuilds, and
# this stage only runs tsc. It is the only package here with scripts.
RUN npm ci --ignore-scripts
COPY --from=prune /repo/out/full/ ./
# root files are not part of the pruned output
COPY tsconfig.base.json ./
# builds @offline-pi/maps-shared, then the backend
RUN npx turbo run build --filter=@offline-pi/maps-backend

# -------------------------------------------------------------- pmtiles ---
# Linux go-pmtiles CLI, same version as UPSTREAM.pmtilesVersion
FROM debian:bookworm-slim AS pmtiles
ARG PMTILES_VERSION=1.31.2
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN arch=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x86_64) \
 && curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${arch}.tar.gz" \
    | tar -xz -C /usr/local/bin pmtiles \
 && /usr/local/bin/pmtiles version

# -------------------------------------------------------------- runtime ---
FROM node:22-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates unzip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prune /repo/out/json/ ./
RUN npm ci --omit=dev --ignore-scripts --workspace @offline-pi/maps-backend \
 && npm cache clean --force

COPY --from=build /app/packages/maps-shared/dist packages/maps-shared/dist
COPY --from=build /app/apps/maps/backend/dist apps/maps/backend/dist
COPY --from=pmtiles /usr/local/bin/pmtiles apps/maps/bin/pmtiles

# The module root (PATHS.root): data/ and assets/ are bind mounts (compose.yml)
WORKDIR /app/apps/maps
RUN mkdir -p data/regions assets .tmp && chown -R node:node data assets .tmp bin
USER node

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081
EXPOSE 8081
CMD ["node", "--enable-source-maps", "backend/dist/main.js"]
