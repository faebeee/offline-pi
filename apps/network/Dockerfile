# Hotspot clients: FastAPI + iw + the IEEE vendor registries (ieee-data),
# so vendor lookups work offline. Built with the repo root as context
# (compose.yml). No UI here: the web app (apps/web) is the UI, core's
# network domain the API the browser uses (/api/network/...).
FROM python:3.13-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends iw ieee-data \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY apps/network/requirements.txt ./
RUN pip install -r requirements.txt

COPY apps/network/app/ app/

# Runs as the container's root, which under rootless Podman is the host user
# (unprivileged), so it writes DATA_DIR as that user (same as mesh). It can
# read the station list (nl80211 allows that without privileges) but can't
# change the firewall: blocking is enforced by the host helper
# (host/network-guard), which watches DATA_DIR/blocked.macs.
ENV DATA_DIR=/app/data LEASES_DIR=/leases OUI_DIR=/usr/share/ieee-data PORT=8085 HOST=127.0.0.1
EXPOSE 8085
# Shell form so PORT/HOST (compose.yml, host networking) are expanded.
CMD uvicorn app.main:create_app --factory --host "$HOST" --port "$PORT" --no-access-log
