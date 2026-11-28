# Supplies

Supplies is the list of what your household keeps for an emergency: water,
food, medicine, batteries and so on, how much, where it is kept and when it
expires. It warns you before things expire and says how many days your
water lasts. Open it with Supplies in the module nav (`/supplies`).

The Swiss authorities (BABS) advise keeping water and food for about a week
for everyone in the household. Supplies helps you check that.

## The screen

The context line shows the number of items, the days of water and when the
list last changed.

### The summary card

- **Water**: how many days the water lasts, against your target (for
  example `4.5 OF 7 DAYS`), with a bar and a badge: `ENOUGH`,
  `BELOW TARGET` (amber) or, under half the target, red. Below it, the
  litres and the daily amount it is based on.
- **Items, Expired, Expiring, Low**: the counts.
- **HOUSEHOLD** opens the settings (see below).

Only items in the Water category with a unit of `L`, `dl`, `cl` or `ml`
count as water, and expired ones don't count. So list water in litres: for
six 1.5 L bottles, enter quantity `9` and unit `L`.

### Warnings

Banners above the list name the items that need attention:

| Banner | Meaning |
|---|---|
| `<N> EXPIRED` (red) | The best-before date has passed. Replace them or take them off the list. |
| `<N> EXPIRING WITHIN 30 DAYS` (amber) | Use them first and buy fresh. The window is set in HOUSEHOLD. |
| `<N> BELOW THE MINIMUM` (amber) | Fewer than the minimum you set for the item. |

### The list

Items are grouped by category (Water, Food, Medicine and first aid,
Hygiene, Power and light, Tools, Other). Each row shows the name, where it
is kept, the best-before date and the minimum, badges for `EXPIRED`,
`EXPIRING` and `LOW`, and the quantity with its unit. The `-` and `+`
buttons take one away or add one, for example when you use a bottle.

## Adding and changing items

Press ADD ITEM (or ADD next to a category), or tap an item to change it:

| Field | Meaning |
|---|---|
| What | The name, e.g. "Rice", "Batteries AA". |
| Category | Decides the group and, for Water, whether it counts as water. |
| Quantity, Unit | How much. The unit is free text: `L`, `kg`, `pcs`, `cans`... |
| Minimum | Optional. Below this the item is `LOW`. |
| Best before | Optional date. |
| Where it is kept | Optional, e.g. "Cellar, shelf 2". |
| Note | Optional. |

DELETE (when changing an item) removes it from the list, after a question.
Only admins can delete (see
[Users and login](14-users.md#admins-and-users)). Everything else is open
to everyone with an account.

## Household settings

HOUSEHOLD on the summary card:

| Setting | Default | Meaning |
|---|---|---|
| People | `2` | How many people the stock is for. |
| Water per person and day | `3` L | For drinking and cooking. |
| Stock should last | `7` days | The target for the water bar. |
| Warn before expiry | `30` days | Items expiring within this window are `EXPIRING`. |

## Where the list is

Supplies is part of outpost itself, like Board: always there, nothing to
install. The list and the household settings are in `supplies.json` in
`CORE_DATA_DIR` (`./data/core` by default). It exists only on this Pi: back it
up (see [Backup and restore](../04-operations/03-backup-and-restore.md)).
