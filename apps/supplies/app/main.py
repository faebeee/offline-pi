"""Supplies module: the household's emergency stock.

What is there (water, food, medicine, batteries, ...), how much, where, and
when it expires. Warns about expired and expiring items and about stock
below its minimum, and says for how many days the water lasts. No UI here:
core's supplies domain (/api/supplies/...) is the API the web app uses.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .store import Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("supplies")

Category = Literal["water", "food", "medicine", "hygiene", "power", "tools", "other"]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class Settings:
    data_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(data_dir=Path(os.environ.get("DATA_DIR", "/app/data")))


def _strip(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _date(v: Any) -> Any:
    v = _strip(v)
    if v is None:
        return None
    if not isinstance(v, str) or not DATE.match(v):
        raise ValueError("expires must be a date like 2027-03-31")
    date.fromisoformat(v)  # raises for 2027-02-30
    return v


class ItemBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: Category = "other"
    quantity: float = Field(default=0, ge=0, le=1e9)
    unit: str = Field(default="", max_length=20)
    minimum: float | None = Field(default=None, ge=0, le=1e9)
    expires: str | None = None
    location: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)

    _s = field_validator("name", "location", "note", mode="before")(_strip)
    _d = field_validator("expires", mode="before")(_date)

    @field_validator("unit", mode="before")
    @classmethod
    def _unit(cls, v: Any) -> Any:
        return (v or "").strip() if isinstance(v, str) or v is None else v


class ItemPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: Category | None = None
    quantity: float | None = Field(default=None, ge=0, le=1e9)
    unit: str | None = Field(default=None, max_length=20)
    minimum: float | None = Field(default=None, ge=0, le=1e9)
    expires: str | None = None
    location: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)

    _s = field_validator("name", "location", "note", mode="before")(_strip)
    _d = field_validator("expires", mode="before")(_date)


class AdjustBody(BaseModel):
    delta: float = Field(ge=-1e9, le=1e9)


class SettingsBody(BaseModel):
    people: int | None = Field(default=None, ge=1, le=1000)
    water_litres_per_day: float | None = Field(default=None, gt=0, le=100)
    target_days: int | None = Field(default=None, ge=1, le=3650)
    expiry_warning_days: int | None = Field(default=None, ge=0, le=365)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.data_dir)
    app = FastAPI(title="outpost supplies")

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        return store.summary()

    @app.get("/api/items")
    def items() -> list[dict[str, Any]]:
        return store.items()

    @app.post("/api/items", status_code=201)
    def create(body: ItemBody) -> dict[str, Any]:
        try:
            item = store.create(body.model_dump())
        except ValueError as err:
            raise HTTPException(409, str(err)) from err
        log.info("item %s added: %s", item["id"], item["name"])
        return item

    @app.patch("/api/items/{item_id}")
    def update(item_id: int, body: ItemPatch) -> dict[str, Any]:
        changes = body.model_dump(exclude_unset=True)
        for k in ("name", "category", "quantity"):
            if k in changes and changes[k] is None:
                raise HTTPException(400, f"{k} can't be empty.")
        if "unit" in changes:
            changes["unit"] = (changes["unit"] or "").strip()
        item = store.update(item_id, changes)
        if item is None:
            raise HTTPException(404, f"Item {item_id} does not exist.")
        return item

    @app.post("/api/items/{item_id}/adjust")
    def adjust(item_id: int, body: AdjustBody) -> dict[str, Any]:
        item = store.adjust(item_id, body.delta)
        if item is None:
            raise HTTPException(404, f"Item {item_id} does not exist.")
        return item

    @app.delete("/api/items/{item_id}", status_code=204)
    def delete(item_id: int) -> None:
        if not store.delete(item_id):
            raise HTTPException(404, f"Item {item_id} does not exist.")
        log.info("item %s deleted", item_id)

    @app.get("/api/settings")
    def get_settings() -> dict[str, Any]:
        return store.settings()

    @app.put("/api/settings")
    def put_settings(body: SettingsBody) -> dict[str, Any]:
        return store.save_settings(body.model_dump(exclude_none=True))

    return app
