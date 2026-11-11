# Overview

outpost is one self-hosted app for a Raspberry Pi that keeps working
without internet. It bundles offline maps, an emergency-knowledge library,
text messaging over a Meshtastic LoRa radio, a live map of that radio mesh
and a dashboard for the Pi itself. You reach all of it on one port, in one
web app, from any browser on the same network or on the Pi's own Wi-Fi
hotspot.

## Who it is for

outpost is for people who want useful information and a way to talk to
each other when the internet or the phone network is gone: a household
preparing for outages, a cabin or boat without coverage, a group using
Meshtastic radios. You set it up once while you still have internet, and
from then on it runs on its own.

You need a little comfort with a Linux terminal for the setup (cloning a
Git repository, running a script). Day to day, everything happens in the
browser.

## What works offline

Once installed and filled with content, nothing needs the internet:

- Maps you downloaded: pan, zoom and search places.
- Books you downloaded in the Library: Wikipedia, medical and survival
  guides, with full-text search.
- Messages over LoRa through your Meshtastic node, and the map of nodes.
- The System and Logs screens.

You need internet for the installation itself (container images, code
dependencies, map fonts), and whenever you download new map regions or
books.

## Modules

outpost is made of modules. Core (the dashboard, System and Logs) always
runs. The other modules are chosen when you install and switched on and off
on the home page.

| Module | Screen | What it does |
|---|---|---|
| Home | `/` | Every installed module as a tile, with on/off switches. |
| Maps | `/maps` | Self-hosted vector maps: download a region once, then pan, zoom and search without internet. With Mesh installed, the Meshtastic nodes are a layer you can switch on and off. |
| Mesh | `/mesh` | Messaging over a USB Meshtastic LoRa node: channel and direct messages, node list, history kept on the Pi. |
| Library | `/library` | Offline Wikipedia, medical and survival guides (Kiwix). You choose the books on the Library screen. |
| System | `/system` | Pi health: temperature, input voltage, throttling, CPU, memory, storage, network, containers. |
| Logs | `/logs` | Log lines of core and every installed module, live and filterable. |
| Info | `/info` | This documentation. |
| Settings | `/settings` | Every setting of the Pi, the data folders and their size. Read only. |

The pages of [chapter 3](../03-modules/README.md) explain each screen.

## Pages

- [How it works](01-how-it-works.md): core and modules, one port, installed
  versus running, data directories, the web app.
- [Hardware](02-hardware.md): which Pi, SD card or SSD, power supply,
  Meshtastic node, Wi-Fi.
