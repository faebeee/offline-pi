# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
# better-sqlite3 ships a binding.gyp, and npm's default for that is `node-gyp
# rebuild` even though the package has no install script. This image has no
# compiler, and it does not need one: the package bundles N-API prebuilds, and
# this stage only runs tsc and vite. It is the only package here with scripts.
RUN npm ci --ignore-scripts
# builds @offline-maps/shared, then the backend and the viewer
RUN npm run build

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

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --omit=dev --ignore-scripts \
      --workspace @offline-maps/backend --workspace @offline-maps/shared \
 && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/apps/backend/public apps/backend/public
COPY --from=pmtiles /usr/local/bin/pmtiles bin/pmtiles

RUN mkdir -p data/regions assets .tmp && chown -R node:node data assets .tmp bin
USER node

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "apps/backend/dist/main.js"]
