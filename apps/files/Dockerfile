# Shared folder: FastAPI streaming uploads and downloads into DATA_DIR.
# Built with the repo root as context (compose.yml). No UI here: the web app
# (apps/web) is the UI, core's files domain the API the browser uses
# (/api/files/...).
FROM python:3.13-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY apps/files/requirements.txt ./
RUN pip install -r requirements.txt

COPY apps/files/app/ app/

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged), so it writes DATA_DIR as that user (same as network).
ENV DATA_DIR=/app/data PORT=8086 HOST=127.0.0.1
EXPOSE 8086
# Shell form so PORT/HOST (compose.yml, host networking) are expanded.
CMD uvicorn app.main:create_app --factory --host "$HOST" --port "$PORT" --no-access-log
