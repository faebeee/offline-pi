# Maps

Maps shows vector maps that are stored on the Pi. You download a region
(a city, a state or a country) once while you have internet. After that
you can pan and zoom it with no internet at all. Open it with Maps in the
module nav (`/maps`).

## One-time setup

The first time you open Maps you may see `ONE-TIME SETUP` with a
`NEEDS INTERNET` badge. Maps needs three things on disk before it can
download regions: the extraction tool, the map fonts and sprites, and the
region catalog. Each shows `READY` or `TO DO`.

Connect the Pi to the internet and press RUN SETUP. Progress and the last
log lines appear below. If it fails, check the connection and press
RETRY SETUP. `./install.sh` normally runs this setup for you, so you only
see it if that step did not finish.

## The map screen

The map fills the screen. On a wide screen the panel with your regions and
places sits next to it. On a phone it is a sheet at the bottom.

- **Panel button** (list icon, top right): show or hide the panel.
- **Zoom**: the plus and minus buttons, or pinch and scroll.
- **Compass**: points north. Tap it to turn the map back to north up.
- **Mesh nodes** (nodes icon, below the compass): shows or hides the
  Meshtastic nodes on the map. Only there when the Mesh module is
  installed. See [Mesh nodes](#mesh-nodes) below.
- **Locate** (bottom right): shows your own position and follows it. The
  browser only allows this on HTTPS or on `localhost`, so on a phone
  connected over the network it usually shows a message instead. The status
  strip shows `GNSS ±8 M` (the accuracy) while you have a position.
- **Cache badge** (top left): `TILES CACHED · <REGION>` when the map
  centre is inside a downloaded region, `NOT CACHED · OUTSIDE REGIONS` when
  it is not. Outside your regions the map is empty.

The context line under the header shows the number of regions, the zoom
level (`Z12.4`) and the coordinates of the map centre. The status strip
shows `LOCAL · 3 REGIONS` and the disk space your regions use (`DISK`).

All regions are shown at once on one map. The map follows the day/night
theme: dark at night, light by day.

## Downloading a region

1. Open the panel, stay on the REGIONS tab and press ADD REGION.
2. Type a city, state or country (at least two letters), for example
   `Berlin`. Searching needs internet. Matching places appear as a list.
3. Pick the right one. It is outlined on the map.
4. Check the REGION ID (used in file names) and choose a DETAIL LEVEL:

   | Level | What you get |
   |---|---|
   | Z10 | Towns and main roads |
   | Z11 | Street network |
   | Z12 | Minor streets |
   | Z13 | Street detail |
   | Z14 | Buildings |
   | Z15 | Buildings, house numbers (default) |

5. Press CHECK SIZE. The Pi measures the exact size before anything is
   downloaded and shows ARCHIVE (size on disk), TO DOWNLOAD and the
   PLANET BUILD date. A `Low disk space` banner warns you if it may not fit.
6. Press DOWNLOAD to start, or DECLINE to stop here.

The download runs on the Pi with a progress bar. You can close the panel or
even the browser: it keeps running. The strip shows `DL 42%`. Only one
download runs at a time. Press CANCEL DOWNLOAD to stop it; the partial file
is removed. When it is done, the map jumps to the new region and a message
says it now works offline.

## Storage needs

Rough sizes at the default level Z15: a city like Berlin is about 65 MB, a
country like Switzerland about 750 MB. Each level lower roughly halves the
size. For large countries choose Z13 or Z14. Regions are stored in
`MAPS_DATA_DIR`. To keep big regions off the SD card, put it on an SSD:
see [Storage](../02-installation/02-storage.md).

## Managing regions

The REGIONS tab lists every region with its detail range, build date and
size. Tap a row to zoom the map to that region.

- **Export** (download icon): saves the region as a `.pmtiles` file, for
  example to use in QGIS or on another device.
- **Delete** (bin icon): opens a confirmation that says how much space it
  frees. Hold DELETE `<REGION>` for 3 seconds (or hold Space or Enter).
  Release early to cancel. The area stops working offline. Saved places
  are kept.

To update a region to newer map data, delete it and download it again.

## Saved places

Saved places are your own markers, for example a water source or a meeting
point. They are stored on the Pi and work offline.

- **Add**: right-click the map, long-press it on a touch screen, or open
  the PLACES tab and press SAVE PLACE AT MAP CENTRE. Give it a name and
  save. You can also type exact coordinates.
- **Move**: drag the marker. The new position is saved when you let go.
- **Edit or delete**: tap the marker, or tap the place in the PLACES tab.
  The dialog lets you rename it or change its coordinates. Hold
  DELETE PLACE to remove it.

The PLACES tab lists only the places in the current map view and says how
many more are saved elsewhere. Places do not belong to a region: deleting
a region keeps them.

## Mesh nodes

When the [Mesh](04-mesh.md) module is installed, Maps can show the
Meshtastic nodes around you on the offline map, updated live as the radio
hears them. Switch the layer on or off with the mesh nodes button (nodes
icon) in the map controls. It is on by default; the browser remembers your
choice. While it is on, the panel has a third tab, NODES, and the status
strip shows the number of nodes on the map (`NODES`).

Mesh must be running for nodes to appear (starting Maps does not start
Mesh). If it is stopped, the NODES tab says so; start it on
[Home](01-home.md). If Mesh does not answer, the map keeps the last nodes
it knew and retries by itself.

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
position is rounded to about 1 to 2 km. Nodes broadcast their position
rarely, so outpost asks a node heard in the last two hours without a known
position for it directly (at most every 30 minutes per node). Nodes whose
owners do not share a position are not on the map; the NODES tab counts them as
`WITHOUT POSITION`.

- **Details**: tap a marker for status, when it was last heard (UTC),
  hops, SNR, battery, altitude, position and hardware. MESSAGE IN MESH
  opens a direct message to that node in [Mesh](04-mesh.md) (OPEN MESH for
  the Pi's own node).
- **NODES tab**: the nodes on the map, the Pi's own node first, then the
  most recently heard. Tap a node to fly to it. SHOW ALL NODES fits every
  node into view. REQUEST POSITIONS asks every node for its position right
  away instead of waiting for its next broadcast: one node every 5 seconds,
  so with many nodes it takes a while (the button counts down). Nodes that
  are switched off or out of range don't answer.
- **From Mesh**: SHOW ON MAP on Mesh's NODES tab opens Maps with the layer
  on, centred on that node with its details open.

## Search

Maps has no offline search for streets or addresses. The place search in
ADD REGION finds areas to download and needs internet. To find something
on the map offline, save it as a place and use the PLACES tab.

## Offline behaviour

Internet is needed only for the one-time setup and for each region
download (including the search for it). Everything else, the tiles, styles,
fonts and your places, comes from the Pi. If the strip shows
`LOCAL · NO ANSWER`, the Maps module does not answer: check it on
[Home](01-home.md) and press RETRY.
