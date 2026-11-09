# ---------------------------------------------------------------- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN npm run build

# ------------------------------------------------------------- vcgencmd ---
# Raspberry Pi firmware CLI (voltages, PMIC rails, throttle flags). It is not
# in Debian, so build it from raspberrypi/utils; it is a single C file that
# talks to /dev/vcio_gencmd, which docker-compose.yml maps into the container.
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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist dist
COPY public/ public/
RUN test -f public/ui/outpost.css || (echo "public/ui missing: run ./start.sh, which copies ../../ui" >&2; exit 1)
COPY --from=vcgencmd /usr/local/bin/vcgencmd /usr/local/bin/vcgencmd

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged). That keeps the host user's `video` group (group_add:
# keep-groups) for the firmware device and lets it write DATA_DIR without uid mapping.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data HOST_ROOT=/hostfs
EXPOSE 8080
# node:sqlite (reads podman's container DB) is still flagged experimental
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "dist/main.js"]
