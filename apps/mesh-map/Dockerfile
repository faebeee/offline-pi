# mesh-map: a dependency-free Node server (server.mjs) that serves, read-only,
# the Maps module's downloaded map data (region archives, fonts, sprites).
# The page itself is the web app's /mesh-map screen (apps/web), served by core.
#
# Built with the repo root as context (compose.yml).

FROM node:22-slim
WORKDIR /app
# server.mjs has no dependencies, so no node_modules in the image
COPY apps/mesh-map/server.mjs ./
# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged), so it can read the Maps module's files whatever their owner and
# mode (same approach as mesh). The mounts are read-only anyway.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8086 MAPS_DATA=/maps/data MAPS_ASSETS=/maps/assets
EXPOSE 8086
CMD ["node", "server.mjs"]
