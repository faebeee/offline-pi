# Installation

You install offline-pi with one script, `install.sh`, from a Git clone of
the project. It checks the system, asks a few questions, builds the
container images and starts everything. The same script is also how you
change the installation later: add or remove modules, reconfigure one, or
move data to another disk.

The installation needs internet access. Once it is done and you have
downloaded the maps and books you want, offline-pi runs without it.

## Pages

- [Install](01-install.md): requirements, the five steps of `install.sh`,
  the first start, re-running it.
- [Storage and SSD](02-storage.md): every data directory, what grows where,
  moving data to an SSD.
- [Network and hotspot](03-network-and-hotspot.md): port, who can reach
  offline-pi, the control PIN, the Wi-Fi hotspot fallback.
- [macOS (development)](04-macos.md): what differs when you run offline-pi
  on a Mac.
