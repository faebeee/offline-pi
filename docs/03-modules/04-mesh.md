# Mesh

Mesh sends and receives text messages over a Meshtastic radio plugged into
the Pi. Open it with Mesh in the module nav (`/mesh`).

Meshtastic is a free, open system for small LoRa radios. Each radio (a
"node") sends short text messages over several kilometres without internet
or a phone network, and passes on messages from other nodes, so messages
can hop across a whole area. Everyone who wants to talk to the Pi needs
their own Meshtastic node, usually paired with the Meshtastic phone app.
The Mesh screen talks as the Pi's node.

Mesh needs a configured radio. If it shows `Mesh is not configured`, plug
the node into the Pi and re-run `./install.sh`. See
[Install](../02-installation/01-install.md).

## The screen

Mesh has two tabs: MESSAGES and NODES. The tab label shows a count, for
example `MESSAGES · 3` for unread messages and `NODES · 14` for nodes heard.

The context line shows the radio's region and modem preset as the radio
reports them, and the open conversation. The status strip shows the
radio link:

| Strip | Meaning |
|---|---|
| `RADIO · LINKED` | The radio is connected and ready |
| `RADIO · CONNECTING` | Connecting to the radio |
| `RADIO · DISCONNECTED` | The radio is unplugged or does not answer. A `Radio not connected` banner explains more |
| `RADIO · PI UNREACHABLE` | Your browser lost the live link to the Pi. The app reconnects by itself |
| `RADIO · MODULE OFF` | The Mesh module is not running |

The strip also shows the Pi's node name (`NODE`), its battery (`BAT`) and
the number of nodes heard (`NODES`).

The history is stored on the Pi, so you can read old messages even while
the radio is unplugged. Sending works again once it is back.

## Channels and direct messages

The MESSAGES tab lists your conversations:

- **Channels**: every channel configured on the radio. Channel 0 is the
  primary channel, usually the public `LongFast` that anyone nearby with
  default settings can read. Other channels are secondary, often private
  ones with their own key. Everyone on a channel reads every message on it.
- **Direct messages**: one-to-one conversations with a single node. Start
  one from the NODES tab with MESSAGE.

A badge such as `2 NEW` marks unread messages. Read markers are kept in
this browser. On a phone the list and the open conversation take turns;
use the back button in the header to return to the list.

Each message shows the sender, how many hops it travelled (`DIRECT`,
`2 HOPS`), the signal quality (`SNR`) and the time in UTC.

## Sending

Type in the box at the bottom and press the send button. On a computer,
Enter sends and Shift+Enter adds a line break.

- **Byte limit**: the counter shows the size, for example `42/200 B`. A
  message may be at most 200 bytes (the default limit). Umlauts and other special characters
  count as two bytes or more. Shorten the message if the counter turns red.
- **Rate limit**: to protect the shared airtime, each device may send only a
  few messages in a row (5 per minute by default). If you send too many,
  the message is not sent and you are asked to wait.
- **PIN**: if a send PIN is set on the Pi (`MESH_SEND_PIN`), a
  `PIN required` dialog asks for it the first time you send. This browser
  remembers it.
- If the radio is not connected, the box says so and sending is blocked.

Keep messages short. LoRa is slow, and in Europe each node may send only a
small share of the time.

## Delivery states

Your own messages show their state under the text:

| State | Meaning |
|---|---|
| `SENDING` | Being handed to the radio |
| `SENT` | Sent on a channel. Channel messages get no confirmation |
| `SENT · RELAYED` | A direct message another node passed on; waiting for the recipient |
| `ACK` | The recipient confirmed the direct message |
| `FAILED` | No confirmation within 2 minutes, or the radio reported an error |

Press RETRY on a failed message to send the same text again as a new
message.

## Nodes

The NODES tab lists every node the radio has heard, the Pi's own node
(`THIS PI`) first, then the most recently heard. Each row shows how long
ago it was heard, the hops, the signal and the distance or battery. Tap a
row for details: last heard, hops, SNR, battery and voltage, distance,
position and hardware. For the Pi's node it also shows firmware and radio
settings.

- **MESSAGE** opens a direct message to that node.
- **SHOW ON MAP** opens the node on the [Mesh map](05-mesh-map.md), or on
  [Maps](02-maps.md) if Mesh map is not installed. It only appears for
  nodes that share a position.

New nodes can take a few minutes to appear after the radio starts.

## Setting up the node

Node settings are changed on the Pi with `./manage.sh mesh`. The commands
that change the radio stop Mesh for a few seconds and start it again.

```bash
./manage.sh mesh status                     # radio state, node, channels
./manage.sh mesh set-name "Pi Base" PI      # name others see (short name up to 4 characters)
./manage.sh mesh set-region EU_868          # LoRa region
./manage.sh mesh fixed-position 47.37 8.54  # fixed position, GPS off
./manage.sh mesh add-channel Family         # private channel with a random key
./manage.sh mesh share                      # channel URL and QR code for other nodes
./manage.sh mesh export messages.csv        # all messages as CSV
```

**Region**: the radio must use the region of the country you are in, and
hardware for that band. In Switzerland and the EU this is `EU_868` with
868 MHz hardware and antenna. Never power a LoRa radio without its antenna.

To share a private channel, run `./manage.sh mesh share` and scan the QR
code with the Meshtastic app on each other node. New channels show up in
the MESSAGES tab by themselves. See
[Everyday commands](../04-operations/01-everyday-commands.md) for more.
