# Diagnostics

Diagnostics checks every part of outpost and tells you what does not work
and what to do about it. Open it when a module does not come up, a
download fails or something behaves oddly. It is module 09, served by
core: it has no container of its own and is always on. Open it with
Diagnostics in the module nav (`/diagnostics`).

The checks run when you open the screen and again with RUN AGAIN; they take
a few seconds. Nothing is changed or repaired from here: each problem says
which command to run on the Pi.

## Results

The banner on top sums up the result. Below it, ALL shows every check and
PROBLEMS only warnings and problems. Each check shows:

| Shown | Meaning |
|---|---|
| `OK` | Works. |
| `INFO` | Worth knowing, nothing to do (for example a module that is not installed, or no internet). |
| `WARNING` | Works now, but will cause trouble (a drive getting full, files that are not writable). |
| `PROBLEM` | Broken now. |
| Grey lines | What was found: paths, owners, versions, error messages. |
| `FIX` | What to do. Commands are meant for a terminal on the Pi, in the project folder. |

REPORT (the download icon on a phone) saves the result as a text file, to
keep or to send to whoever helps you.

## What is checked

**Setup**

- `.env` is readable, and which modules are installed.
- Core reaches Podman (`podman.socket`) and can read the container list.
- Whether a control PIN protects starting and stopping modules.
- The clock: the Pi has no clock battery, so without internet its time can
  be wrong after a power cut.

**Modules**

- For every installed module: configured, container created, switched on,
  running, healthy and answering. A module started only minutes ago is
  marked, since a module that keeps crashing restarts again and again.
- Mesh: the USB radio is plugged in (or the network node is set).

**Storage**

- The USB drive set up with `host/usb-storage` is mounted.
- Every data folder (`MAPS_DATA_DIR`, `KNOWLEDGE_CONTENT_DIR`, ...) exists
  and is writable for the user the containers write as. Files left behind
  by `sudo` that the containers cannot change are found too.
- A folder under `/media/...` or `/mnt/...` while the drive is not mounted
  there: the data then lands on the SD card instead of the drive.
- A drive mounted read-only (usually after a file system error).
- Free space on every drive with data, and on the system disk: warning
  below 3 GB or 5 %, problem below 1 GB or 2 %.

**Host**

- CPU temperature: warning from 70 °C, problem from 80 °C.
- Power supply: under-voltage right now is a problem, under-voltage since
  boot a warning. A weak power supply makes USB drives disconnect and can
  corrupt data.
- Free memory, uptime (a restart you did not do points at the power
  supply) and the internet connection.

See [Troubleshooting](../04-operations/05-troubleshooting.md) for more on
each problem.
