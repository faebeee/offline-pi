# Meshtastic gateway: FastAPI + the official meshtastic Python library.
FROM python:3.13-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app/ app/
COPY public/ public/
# public/ui is the shared Outpost UI package, copied in by start.sh/install.sh
RUN test -f public/ui/outpost.css || (echo "public/ui missing: run ./start.sh, which copies ../../ui" >&2; exit 1)

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged). That keeps the host user's `dialout` group (group_add:
# keep-groups) for the serial device and lets it write DATA_DIR without uid
# mapping (same approach as apps/monitor).
ENV DATA_DIR=/app/data MESH_DEVICE_PATH=/dev/meshtastic PORT=8084 HOST=0.0.0.0
EXPOSE 8084
# Shell form (not exec array) so PORT/HOST env vars (set via docker-compose,
# e.g. for host networking) are expanded at container start.
CMD uvicorn app.main:create_app --factory --host "$HOST" --port "$PORT" --no-access-log
