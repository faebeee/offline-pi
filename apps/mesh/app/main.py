"""FastAPI app: REST + websocket API and the static web UI."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .config import Settings
from .radio import Radio, RadioError, parse_conv
from .store import Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("mesh")

STALE_AFTER = 120  # seconds without any ack before a sent message counts as failed


class SendBody(BaseModel):
    conv: str  # 'ch:<index>' or 'dm:<node num>'
    text: str


class Hub:
    """Fan-out of live events to all connected websockets."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def emit(self, kind: str, data: Any) -> None:
        """Thread-safe: called from the radio's threads."""
        if self.loop is None or self.loop.is_closed():
            return
        payload = json.dumps({"type": kind, "data": data})
        asyncio.run_coroutine_threadsafe(self._broadcast(payload), self.loop)

    async def _broadcast(self, payload: str) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001 - client went away
                self.clients.discard(ws)


class RateLimiter:
    def __init__(self, count: int, window: int):
        self.count, self.window = count, window
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> float:
        """0 if allowed (and recorded), else seconds until the next slot."""
        if not self.count:
            return 0
        now = time.monotonic()
        hits = self.hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.count:
            return hits[0] + self.window - now
        hits.append(now)
        return 0


def client_key(request: Request) -> str:
    """Rate-limit key: the browser's address. Behind core (loopback) it is the
    first X-Forwarded-For entry, so the limit stays per client, not per core."""
    host = request.client.host if request.client else "?"
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded and host in ("127.0.0.1", "::1"):
        return forwarded.split(",")[0].strip() or host
    return host


def create_app(settings: Settings | None = None, interface_factory=None, start_radio: bool = True) -> FastAPI:
    settings = settings or Settings.from_env()
    hub = Hub()
    store = Store(settings.data_dir / "mesh.db")
    radio = Radio(settings, store, hub.emit, interface_factory)
    limiter = RateLimiter(settings.rate_count, settings.rate_window)

    async def expire_pending() -> None:
        while True:
            await asyncio.sleep(30)
            for row in store.fail_stale(time.time() - STALE_AFTER):
                hub.emit("message", row)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub.loop = asyncio.get_running_loop()
        if start_radio:
            radio.start()
        task = asyncio.create_task(expire_pending())
        yield
        task.cancel()
        radio.stop()
        store.close()

    app = FastAPI(title="outpost mesh", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.radio, app.state.store, app.state.hub = radio, store, hub

    def ui_config() -> dict[str, Any]:
        return {
            "send_pin_required": bool(settings.send_pin),
            "max_text_bytes": settings.max_text_bytes,
            "rate_limit": {"count": settings.rate_count, "window": settings.rate_window},
        }

    @app.get("/api/status")
    def get_status() -> dict[str, Any]:
        return {**radio.status(), "config": ui_config()}

    @app.get("/api/conversations")
    def get_conversations() -> list[dict[str, Any]]:
        return store.conversations()

    @app.get("/api/messages")
    def get_messages(
        conv: str = Query(...),
        before: int | None = Query(None),
        limit: int = Query(100, ge=1, le=500),
    ) -> list[dict[str, Any]]:
        try:
            parse_conv(conv)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return store.messages(conv, before, limit)

    @app.get("/api/nodes")
    def get_nodes() -> list[dict[str, Any]]:
        return store.nodes()

    @app.post("/api/positions/request", status_code=202)
    def request_positions() -> dict[str, Any]:
        """Ask every node for its position, one every few seconds."""
        try:
            queued = radio.request_all_positions()
        except RadioError as exc:
            raise HTTPException(503, str(exc)) from exc
        return {"queued": queued, "seconds": queued * 5}

    @app.post("/api/messages", status_code=201)
    async def post_message(body: SendBody, request: Request, x_send_pin: str = Header("")) -> dict[str, Any]:
        if settings.send_pin and not hmac.compare_digest(x_send_pin.encode(), settings.send_pin.encode()):
            raise HTTPException(401, "Wrong or missing PIN")
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Message is empty")
        size = len(text.encode("utf-8"))
        if size > settings.max_text_bytes:
            raise HTTPException(400, f"Message is {size} bytes, the limit is {settings.max_text_bytes}")
        try:
            parse_conv(body.conv)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        if radio.state != "connected":
            raise HTTPException(503, "Radio is not connected")
        wait = limiter.check(client_key(request))
        if wait:
            raise HTTPException(429, f"Too many messages, try again in {int(wait) + 1} s")
        try:
            return await asyncio.to_thread(radio.send, text, body.conv)
        except RadioError as exc:
            raise HTTPException(503, str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - serial write failed etc.
            log.exception("Sending failed")
            raise HTTPException(503, f"Sending failed: {exc}") from exc

    @app.websocket("/api/live")
    async def live(ws: WebSocket) -> None:
        await ws.accept()
        hub.clients.add(ws)
        try:
            await ws.send_text(json.dumps({"type": "status", "data": {**radio.status(), "config": ui_config()}}))
            while True:
                await ws.receive_text()  # keepalive pings from the browser; ignored
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(ws)

    return app
