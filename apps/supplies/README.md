# supplies

The household's emergency stock: what, how much, where, best-before dates.
Warns about expired, expiring and low items and says how many days the
water lasts. Open `http://<pi>:8080/supplies`. User guide:
[docs/03-modules/13-supplies.md](../../docs/03-modules/13-supplies.md).

Supplies is a screen core serves itself: this folder holds only its
manifest (`"service": "core"`, `"optional": false`, `"nav": "apps"`). There
is no container and nothing to install.

## How it works

```
browser ──> core /api/supplies/* ──> SuppliesStore (apps/core/src/domains/supplies)
                                      └─ CORE_DATA_DIR/supplies.json
```

- An item: `name`, `category` (`water`, `food`, `medicine`, `hygiene`,
  `power`, `tools`, `other`), `quantity`, `unit` (free text), `minimum`,
  `expires` (`YYYY-MM-DD`, a real date), `location`, `note`. It comes back
  with `daysLeft`, `expired`, `expiring` (within `expiryWarningDays`) and
  `low` (below `minimum`), computed against today's date on the Pi.
- Household settings: `people` (2), `waterLitresPerDay` (3), `targetDays`
  (7), `expiryWarningDays` (30); defaults after the Swiss emergency
  stockpile advice (BABS).
- **Days of water** = litres of non-expired Water items whose unit is a
  volume (`L`, `dl`, `cl`, `ml`) / (people x litres per day).
- `POST /api/supplies/items/:id/adjust` adds to the quantity (the `-`/`+`
  buttons), never below 0. At most 5000 items.
- The store holds everything in memory and saves `supplies.json` on every
  change (temp file + rename, `platform/storage/json-file.ts`).
- Every change needs `X-Pi-Monitor`; deleting an item is a control action
  (admins only).
