# Built with the repo root as context (compose.yml): `turbo prune` cuts the
# monorepo down to core and the workspaces it depends on (@offline-pi/ui,
# @offline-pi/web and its @offline-pi/api-client). The web app is built here
# and served by core at /.

# ---------------------------------------------------------------- prune ---
FROM node:22-slim AS prune
ARG TURBO_VERSION=2.11.10
RUN npm install -g "turbo@${TURBO_VERSION}"
WORKDIR /repo
COPY . .
RUN turbo prune @offline-pi/core --docker
# every module manifest (apps/<name>/module.json): home tiles, nav, upstreams
RUN mkdir -p /manifests \
 && for f in apps/*/module.json; do \
      mkdir -p "/manifests/$(dirname "$f")" && cp "$f" "/manifests/$f"; \
    done

# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY --from=prune /repo/out/json/ ./
RUN npm ci --ignore-scripts
COPY --from=prune /repo/out/full/ ./
# core and, before it (^build), the web app
RUN npx turbo run build --filter=@offline-pi/core

# ------------------------------------------------------------- vcgencmd ---
# Raspberry Pi firmware CLI (voltages, PMIC rails, throttle flags). It is not
# in Debian, so build it from raspberrypi/utils; it is a single C file that
# talks to /dev/vcio_gencmd, which compose.yml maps into the container.
FROM debian:bookworm-slim AS vcgencmd
ARG RPI_UTILS_REF=master
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates gcc libc6-dev git \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$RPI_UTILS_REF" https://github.com/raspberrypi/utils /src \
 && gcc -O2 -o /usr/local/bin/vcgencmd /src/vcgencmd/vcgencmd.c

# -------------------------------------------------------------- runtime ---
FROM node:22-slim
WORKDIR /app
COPY --from=prune /repo/out/json/ ./
# the web app's packages are all devDependencies (bundled by Vite), so only
# core's runtime dependencies are installed here
RUN npm ci --omit=dev --ignore-scripts --workspace @offline-pi/core && npm cache clean --force
# the Outpost package, served at /ui/ (node_modules/@offline-pi/ui links here)
COPY --from=prune /repo/out/full/packages/ui packages/ui
COPY --from=prune /manifests/apps/ apps/
COPY --from=build /app/apps/core/dist apps/core/dist
# the built web app (node_modules/@offline-pi/web links to apps/web)
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=vcgencmd /usr/local/bin/vcgencmd /usr/local/bin/vcgencmd

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged). That keeps the host user's `video` group (group_add:
# keep-groups) for the firmware device and lets it write DATA_DIR without uid mapping.
WORKDIR /app/apps/core
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data HOST_ROOT=/hostfs
EXPOSE 8080
# node:sqlite (reads podman's container DB) is still flagged experimental
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "dist/main.js"]
