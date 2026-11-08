# Meshtastic gateway: FastAPI + the official meshtastic Python library.
FROM python:3.13-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app/ app/
COPY public/ public/

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged). That keeps the host user's `dialout` group (group_add:
# keep-groups) for the serial device and lets it write DATA_DIR without uid
# mapping (same approach as apps/monitor).
ENV DATA_DIR=/app/data MESH_DEVICE_PATH=/dev/meshtastic
EXPOSE 8084
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8084", "--no-access-log"]
