# Meshtastic gateway: FastAPI + the official meshtastic Python library.
# Built with the repo root as context (compose.yml).
FROM python:3.13-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY apps/mesh/requirements.txt ./
RUN pip install -r requirements.txt

COPY apps/mesh/app/ app/
# No UI here: the web app (apps/web) is the UI, core's mesh domain the API
# the browser uses (/api/mesh/..., socket namespace /mesh).

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged). That keeps the host user's `dialout` group (group_add:
# keep-groups) for the serial device and lets it write DATA_DIR without uid
# mapping (same approach as core).
ENV DATA_DIR=/app/data MESH_DEVICE_PATH=/dev/meshtastic PORT=8084 HOST=127.0.0.1
EXPOSE 8084
# Shell form (not exec array) so PORT/HOST env vars (set via compose.yml,
# host networking) are expanded at container start.
CMD uvicorn app.main:create_app --factory --host "$HOST" --port "$PORT" --no-access-log
