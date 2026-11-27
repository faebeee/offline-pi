# supplies

The household's emergency stock: what, how much, where, best-before dates.
Warns about expired, expiring and low items and says how many days the
water lasts. Open `http://<pi>:8080/supplies`. User guide:
[docs/03-modules/13-supplies.md](../../docs/03-modules/13-supplies.md).

## How it works

```
browser ──> core /api/supplies/* ──> supplies :8088 (rootless container, FastAPI)
                                      └─ DATA_DIR/supplies.db (SQLite)
```

- `items`: `name`, `category` (`water`, `food`, `medicine`, `hygiene`,
  `power`, `tools`, `other`), `quantity`, `unit` (free text), `minimum`,
  `expires` (`YYYY-MM-DD`), `location`, `note`. Each item comes back with
  `days_left`, `expired`, `expiring` (within `expiry_warning_days`) and
  `low` (below `minimum`), computed against today's date.
- `settings`: `people` (2), `water_litres_per_day` (3), `target_days` (7),
  `expiry_warning_days` (30); defaults after the Swiss emergency stockpile
  advice (BABS).
- **Days of water** = litres of non-expired Water items whose unit is a
  volume (`L`, `dl`, `cl`, `ml`) / (people x litres per day).
- `POST /api/items/{id}/adjust` changes the quantity atomically (the `-`/`+`
  buttons), never below 0.
- SQLite with `journal_mode=DELETE` (exFAT drives).
- Core (`apps/core/src/domains/supplies/`) checks `X-Pi-Monitor` on every
  change; deleting an item is a control action (`CONTROL_PIN`).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `SUPPLIES_PORT` | `8088` | Internal port (loopback). |
| `SUPPLIES_DATA_DIR` | `./data/supplies` | `supplies.db`. Small. |

The household settings are edited on the screen, not in `.env`.

## Development

```sh
cd apps/supplies
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
DATA_DIR=./data .venv/bin/uvicorn app.main:create_app --factory --port 8088
```
