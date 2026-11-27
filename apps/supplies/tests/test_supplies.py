from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import Settings, create_app
from app.store import Store, litres


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def iso(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def test_litres():
    assert litres(6, "L") == 6
    assert litres(500, "ml") == 0.5
    assert litres(3, "bottles") is None


def test_create_and_status(client):
    r = client.post("/api/items", json={"name": " Mineral water ", "category": "water", "quantity": 18, "unit": "L"})
    assert r.status_code == 201 and r.json()["name"] == "Mineral water"
    client.post("/api/items", json={"name": "Rice", "category": "food", "quantity": 1, "unit": "kg", "minimum": 2})
    client.post("/api/items", json={"name": "Aspirin", "category": "medicine", "quantity": 1, "expires": iso(-1)})
    client.post("/api/items", json={"name": "Batteries AA", "category": "power", "quantity": 8, "expires": iso(10)})
    # expired water does not count
    client.post("/api/items", json={"name": "Old water", "category": "water", "quantity": 100, "unit": "L", "expires": iso(-5)})

    s = client.get("/api/status").json()
    assert s["items"] == 5
    assert (s["expired"], s["expiring"], s["low"]) == (2, 1, 1)
    # 18 L for 2 people at 3 L/day
    assert s["water_litres"] == 18 and s["water_days"] == 3.0

    items = {i["name"]: i for i in client.get("/api/items").json()}
    assert items["Aspirin"]["expired"] and items["Aspirin"]["days_left"] == -1
    assert items["Batteries AA"]["expiring"] and not items["Batteries AA"]["expired"]
    assert items["Rice"]["low"]


def test_validation(client):
    assert client.post("/api/items", json={"name": ""}).status_code == 422
    assert client.post("/api/items", json={"name": "x", "quantity": -1}).status_code == 422
    assert client.post("/api/items", json={"name": "x", "expires": "2027-02-30"}).status_code == 422
    assert client.post("/api/items", json={"name": "x", "expires": "31.12.2027"}).status_code == 422
    assert client.post("/api/items", json={"name": "x", "category": "weapons"}).status_code == 422
    assert client.post("/api/items", json={"name": "x", "expires": ""}).json()["expires"] is None


def test_update_adjust_delete(client):
    item = client.post("/api/items", json={"name": "Candles", "category": "power", "quantity": 3}).json()
    r = client.patch(f"/api/items/{item['id']}", json={"location": "Cellar", "expires": None})
    assert r.json()["location"] == "Cellar"
    assert client.post(f"/api/items/{item['id']}/adjust", json={"delta": -5}).json()["quantity"] == 0
    assert client.post(f"/api/items/{item['id']}/adjust", json={"delta": 2}).json()["quantity"] == 2
    assert client.patch(f"/api/items/{item['id']}", json={"quantity": None}).status_code == 400
    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.post(f"/api/items/{item['id']}/adjust", json={"delta": 1}).status_code == 404


def test_settings(client):
    assert client.get("/api/settings").json()["people"] == 2
    s = client.put("/api/settings", json={"people": 4, "water_litres_per_day": 2.5}).json()
    assert s["people"] == 4 and s["water_litres_per_day"] == 2.5 and s["target_days"] == 7
    assert client.put("/api/settings", json={"people": 0}).status_code == 422


def test_expiry_warning_window(tmp_path):
    store = Store(tmp_path)
    store.create({"name": "Soup", "category": "food", "quantity": 1, "unit": "", "expires": iso(40)})
    assert not store.items()[0]["expiring"]
    store.save_settings({"expiry_warning_days": 60})
    assert store.items()[0]["expiring"]
