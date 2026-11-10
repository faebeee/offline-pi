# Mesh map

Mesh map shows the Meshtastic nodes around you on the offline map, updated
live as the radio hears them. Open it with Mesh map in the module nav
(`/mesh-map`). The screen title is `NODE MAP`.

## What it needs

Mesh map has no data of its own. It combines two other modules:

- **Mesh** supplies the nodes and their positions. Mesh must be installed
  and configured, and switched on: starting Mesh map does not start Mesh
  for you (when the Pi boots, core starts Mesh first).
- **Maps** supplies the map. Mesh map shows the regions you downloaded in
  [Maps](02-maps.md), even while the Maps module is stopped. It never
  downloads anything itself. A region you add in Maps appears on the next
  visit (reload the page).

Without a downloaded region you see a `No offline map` banner and the
`NO OFFLINE TILES` badge. Nodes are still placed, on a blank map.

If Mesh is not running, a `Mesh is not running` banner offers a HOME
button, where you can switch it on. If Mesh does not answer, the map keeps
the last nodes it knew and retries by itself.

## What it shows

Each node that shares its position is a round marker with its short name
(or the last 4 characters of its id). The Pi's own node is labelled
`BASE`. The colour of the ring shows how old the position is:

| Marker | Age | Label |
|---|---|---|
| Green ring | Heard in the last 2 hours | `FRESH` |
| Amber ring | Heard within the last day | `OLD`, plus the age, for example `ABCD · 5 H` |
| Grey, faded | Older than a day, or never heard | `STALE`, plus the age |

Positions are the last ones the radio heard, not live tracking. Many nodes
share only an approximate position: on the public `LongFast` channel the
position is rounded to about 1 to 2 km. Nodes whose owners do not share a
position are not on the map. The node list counts them as
`WITHOUT POSITION`.

Tap a marker for details: status, when it was last heard (UTC), hops,
SNR, battery, altitude, position and hardware. MESSAGE IN MESH opens a
direct message to that node in [Mesh](04-mesh.md) (OPEN MESH for the Pi's
own node).

## Map controls

- **Node list** (list button): the nodes on the map, newest first. On a
  wide screen it is a side panel, on a phone a sheet. Tap a node to fly to
  it.
- **Zoom in / zoom out**, **north up** (compass) and **show all nodes**
  (fits every node into view).
- **My position** (amber button): shows where you are. The browser only
  allows this on HTTPS or on `localhost`. Otherwise a
  `Position unavailable` banner explains why.
- **Cache badge**: `TILES CACHED · <REGION>` shows which offline region you
  are looking at.

The map follows the day/night theme.

## Status strip

| Strip | Meaning |
|---|---|
| `MESH · LIVE` | Live updates from Mesh |
| `MESH · CONNECTING` | Reading the node list |
| `MESH · STOPPED` | The Mesh module is not running |
| `MESH · NO ANSWER` | Mesh does not answer |
| `MESH · OFF` | Mesh is not installed |

The strip also shows the number of nodes (`NODES`) and, while your own
position is shown, its accuracy (`GNSS`).

## Opening a node from Mesh

In [Mesh](04-mesh.md), on the NODES tab, SHOW ON MAP opens this map
centred on that node with its details open.
