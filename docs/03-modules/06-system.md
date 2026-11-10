# System

System shows the health of the Pi itself: temperature, power, CPU, memory,
storage, network, the containers of offline-pi and the network connections.
It is part of core, so it is always on. Open it with System in the module
nav (`/system`).

The header shows the Pi's hostname. The context line shows the model, the
operating system and the uptime. Values refresh every 2 seconds
(`SAMPLE_INTERVAL_MS`); containers and connections every 5 seconds.

## Status and banners

The status strip shows `CORE · LIVE` while readings arrive, then the CPU
temperature (`TEMP`), the input voltage (`VOLT`) and the current the power
supply negotiated (`PSU`). If the link drops, it shows
`CORE · RECONNECTING` or `CORE · NO LINK`, and `DATA` shows the age of the
last reading.

Above the cards, banners sum up the state:

- `All systems normal`: nothing to do.
- `Attention needed` (red, pinned at the top): under-voltage right now,
  CPU throttled, a critical temperature or voltage, or a disk 95% full.
- `Check your Pi` (amber): for example a high temperature, a low voltage,
  a disk 90% full, USB over-current, or an unhealthy or stopped container.
- `Power problems since boot`: the firmware recorded under-voltage,
  throttling or frequency capping earlier, even if it is fine now.

## Key readings

Four large readouts at the top: CPU TEMP, input voltage (INPUT 5 V), CPU
USAGE and MEMORY. The one that needs the most attention gets corner
brackets.

| Reading | Normal | Elevated | High | Critical |
|---|---|---|---|---|
| CPU temperature | below 70 °C | from 70 °C | from 80 °C | from 85 °C |
| Input voltage | above 4.85 V | 4.85 V or less | 4.75 V or less | 4.65 V or less |
| CPU and memory use | below 80% | from 80% | from 90% | from 95% |

A Pi throttles itself when it is too hot or the power supply is too weak.
Low voltage can cause crashes and make USB drives such as an SSD drop out:
use a power supply that is strong enough for the Pi and everything plugged
into it.

## Cards

| Card | What it shows |
|---|---|
| Temperature | Other temperature sensors, the fan speed (or `not detected`), whether the soft temperature limit is active, and a chart of the CPU temperature |
| Power | Input and core voltage, board power in watts, the maximum current the power supply offers (`not 5 A` means a weaker supply), the USB current limit, USB over-current, and a voltage chart. PMIC RAILS opens the voltage and current of each power rail |
| Throttle flags | The firmware's four flags (under-voltage, CPU throttled, frequency capped, soft temperature limit), each `NO` or `ACTIVE` now and `NO` or `SEEN` since boot |
| CPU | Use and frequency per core, load average over 1, 5 and 15 minutes, maximum frequency, and a usage chart |
| Memory | Used, available and total memory, swap, and a usage chart |
| Storage | Every disk (SD card, SSD, boot partition) with a fill bar, free space, device and file system. `NEARLY FULL` from 90%, `FULL` from 95%. Also disk read and write speed |
| Network | Download and upload speed per interface, the Wi-Fi signal (in dBm and percent), the Pi's IP addresses, and a throughput chart |
| Apps and containers | Every container on the Pi: module, state, health, path or ports, uptime, CPU, memory and image |
| Connections | Open ports and active network connections |
| System | Hostname, model, OS, kernel, architecture, uptime, processes and the time of the last reading |
| Power events | When under-voltage, throttling, frequency capping or the soft temperature limit started and ended, newest first |

Values the Pi cannot measure show `--` or `n/a`. Voltage and throttle
readings need the Pi's firmware tool (`vcgencmd`); on other hardware they
show as unavailable.

### Apps and containers

The state badge is green for running, amber for paused or stopping and red
for exited or stopped (with the exit code). A second badge shows the health
check: healthy, starting or unhealthy. Rows of offline-pi modules link to
their screen.

Optional modules have START and STOP buttons. STOP asks for a second press
(CONFIRM STOP within 4 seconds). Core's own row says `This app`. This works
like the switches on [Home](01-home.md), including the control PIN.

### Connections

Four counters: ESTABLISHED connections, REMOTE HOSTS, ports OPEN TO LAN and
connections in TIME-WAIT. Below are the LISTENING PORTS (port, address and
service) and the ACTIVE CONNECTIONS (direction, remote address, local port
and service). Connections inside the Pi (loopback) are hidden; tick
SHOW LOOPBACK to see them. Use this card to check that only the ports you
expect are open to the network.

## History: 15 min and 24 h

The 15 MIN and 24 H buttons in the header switch every chart between the
last 15 minutes and the last 24 hours. The 24 hour charts have one point
per minute. The voltage chart keeps the lowest value of each minute, so
short dips stay visible. The 24 hour history and the power events are
stored on the Pi and survive a restart. Your choice of range is kept in
this browser.
