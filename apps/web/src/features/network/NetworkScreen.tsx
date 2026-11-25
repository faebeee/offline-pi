import {
  getNetworkClientsQueryKey,
  getNetworkStatusQueryKey,
  networkBlock,
  networkForget,
  networkUnblock,
  useNetworkClients,
  useNetworkStatus,
  type HotspotClient,
  type NetworkStatus,
} from "@outpost/api-client";
import { ago, bytes } from "@outpost/ui/outpost.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import { Screen } from "../../app/Screen";
import { Badge, Banner, Icon, Illustration } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule, withControlPin } from "../modules/useModules";
import { duration, monogram, signalText, title } from "./format";
import "./network.css";

const POLL_MS = 5000;

/** Network: the devices on the Pi's Wi-Fi hotspot, inspect and block them. */
export function NetworkScreen() {
  const running = isRunning(useModule("network"));
  const status = useNetworkStatus({ query: { enabled: running, refetchInterval: POLL_MS } }).data;

  const context = status?.interfaceFound
    ? [
        status.ssid,
        status.channel ? `CH ${status.channel}` : null,
        `${status.connected} CONNECTED`,
        status.blocked ? `${status.blocked} BLOCKED` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Screen module="network" title="Hotspot" context={running ? context : undefined}>
      <ModuleGate id="network">
        <Devices status={status} />
      </ModuleGate>
    </Screen>
  );
}

/** What is wrong with the hotspot or with blocking, as banners. */
function StatusBanners({ status }: { status: NetworkStatus }) {
  const e = status.enforcer;
  return (
    <>
      {!status.iwAvailable || !status.interfaceFound ? (
        <Banner tone="info" title="No hotspot found">
          {status.iwAvailable
            ? `No Wi-Fi interface ${status.interface ?? "in access-point mode"} on this host. Devices appear here once the hotspot runs (host/hotspot-pi) or NETWORK_IFACE names it.`
            : "This host has no Wi-Fi tools (on macOS there is no hotspot to watch)."}
        </Banner>
      ) : status.mode !== "ap" ? (
        <Banner tone="info" title="Hotspot is off">
          {status.interface} is connected to {status.ssid ? `"${status.ssid}"` : "a Wi-Fi network"} as a client, so no
          devices can join the Pi. Devices seen before are still listed.
        </Banner>
      ) : null}
      {!e.installed ? (
        <Banner tone="cau" title="Blocking is not enforced">
          Blocked devices are listed, but nothing stops them until the blocking helper is installed on the Pi:{" "}
          <code>./manage.sh network install-guard</code>
        </Banner>
      ) : e.error ? (
        <Banner tone="crit" title="Blocking helper failed">
          {e.error}. See <code>journalctl -u outpost-network-guard.service</code> on the Pi.
        </Banner>
      ) : null}
      {!status.leasesReadable && (
        <Banner tone="info" title="No DHCP leases">
          IP addresses come from the ARP table only and hostnames are missing (NETWORK_LEASES_PATH).
        </Banner>
      )}
    </>
  );
}

function Devices({ status }: { status: NetworkStatus | undefined }) {
  const clients = useNetworkClients({ query: { refetchInterval: POLL_MS } });
  const list = clients.data ?? [];
  const connected = list.filter((c) => c.connected);
  const blocked = list.filter((c) => !c.connected && c.blocked);
  const seen = list.filter((c) => !c.connected && !c.blocked);

  return (
    <div className="net vstack">
      {status && <StatusBanners status={status} />}
      {clients.error && (
        <Banner tone="crit" title="Could not load the devices">
          {clients.error.message}
        </Banner>
      )}
      {clients.isSuccess && list.length === 0 ? (
        <div className="empty">
          <Illustration name="network" />
          <p className="empty-title">No devices yet</p>
          <p>Phones and laptops appear here as soon as they join the hotspot.</p>
        </div>
      ) : (
        <>
          <Section title="Connected" items={connected} empty="Nobody is on the hotspot right now." />
          {blocked.length > 0 && <Section title="Blocked" items={blocked} />}
          {seen.length > 0 && <Section title="Seen before" items={seen} hint="Last 30 days" />}
        </>
      )}
    </div>
  );
}

function Section({ title: heading, items, empty, hint }: { title: string; items: HotspotClient[]; empty?: string; hint?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (mac: string) =>
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });

  return (
    <section className="net-section">
      <div className="net-section-head">
        <h2 className="h2">
          {heading} <span className="net-count">· {items.length}</span>
        </h2>
        {hint && <span className="help">{hint}</span>}
      </div>
      {items.length === 0 ? (
        <p className="help">{empty}</p>
      ) : (
        <ul className="list net-list">
          {items.map((c) => (
            <DeviceRow key={c.mac} c={c} open={open.has(c.mac)} onToggle={() => toggle(c.mac)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeviceRow({ c, open, onToggle }: { c: HotspotClient; open: boolean; onToggle: () => void }) {
  const detailId = `net-${c.mac.replaceAll(":", "")}`;
  const st = c.station;
  const meta = [c.mac, c.ip, c.connected ? signalText(st?.signalDbm) : ago(c.lastSeen)].filter(Boolean);
  const vendor = c.randomized ? "Private address (randomized)" : (c.vendor ?? "Unknown vendor");

  const rows: [string, ReactNode][] = [];
  const add = (k: string, v: ReactNode | null | undefined) => {
    if (v != null && v !== "") rows.push([k, v]);
  };
  add("MAC address", <span className="mono">{c.mac}</span>);
  add(
    "Vendor",
    c.randomized
      ? "None: the device uses a private, randomized address for this network (common on phones), so the vendor can't be known."
      : (c.vendor ?? "Not in the IEEE registry"),
  );
  add("IP address", c.ip && <span className="mono">{c.ip}</span>);
  add("Hostname", c.hostname);
  if (st) {
    add(
      "Signal",
      st.signalDbm == null ? null : `${signalText(st.signalDbm)}${st.signalAvgDbm != null ? ` · avg ${st.signalAvgDbm} dBm` : ""}`,
    );
    add("Connected for", duration(st.connectedSeconds));
    add(
      "Last activity",
      st.inactiveMs == null ? null : st.inactiveMs < 1000 ? "just now" : `${duration(Math.round(st.inactiveMs / 1000))} ago`,
    );
    add("Traffic", st.rxBytes == null && st.txBytes == null ? null : `↑ ${bytes(st.rxBytes)} sent · ↓ ${bytes(st.txBytes)} received`);
    add("Link speed", [st.txBitrate && `to device ${st.txBitrate}`, st.rxBitrate && `from device ${st.rxBitrate}`].filter(Boolean).join(" · "));
  } else {
    add("Last seen", ago(c.lastSeen));
  }
  add("First seen", c.firstSeen ? ago(c.firstSeen) : null);
  add("DHCP lease", c.leaseExpires ? `until ${new Date(c.leaseExpires * 1000).toLocaleString()}` : null);
  if (c.blocked) {
    add("Blocked", `${ago(c.blockedAt)}${c.note ? ` · ${c.note}` : ""}`);
    add("Firewall", c.enforced ? "Blocked on the Pi: no traffic gets through." : "Not applied yet (is the blocking helper installed?)");
  }

  return (
    <li className={open ? "is-open" : undefined}>
      <button type="button" className="row has-mono" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className="monogram" aria-hidden="true">
          {monogram(c)}
        </span>
        <span className="row-main">
          <span className="row-title">{title(c)}</span>
          <span className="row-meta">{meta.join(" · ")}</span>
          <span className="row-meta net-vendor">{vendor}</span>
        </span>
        {c.you && (
          <span className="badge badge-sm badge-acc">
            <Icon name="locate" />
            YOU
          </span>
        )}
        {c.blocked &&
          (c.enforced ? (
            <Badge state="crit" className="badge-sm">
              BLOCKED
            </Badge>
          ) : (
            <Badge state="cau" className="badge-sm">
              BLOCK PENDING
            </Badge>
          ))}
        <Icon name="chevron" className="row-chevron" />
      </button>
      <div className="net-detail" id={detailId} hidden={!open}>
        <dl className="kv">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
        {open && <DeviceActions c={c} />}
      </div>
    </li>
  );
}

/** Block / unblock / forget, through the control PIN like module start/stop. */
function DeviceActions({ c }: { c: HotspotClient }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getNetworkClientsQueryKey() });
    void qc.invalidateQueries({ queryKey: getNetworkStatusQueryKey() });
  };
  const action = useMutation({
    mutationFn: (kind: "block" | "unblock" | "forget") =>
      withControlPin(`${kind} devices`, async () => {
        if (kind === "block") await networkBlock(c.mac, { note: note.trim() || undefined });
        else if (kind === "unblock") await networkUnblock(c.mac);
        else await networkForget(c.mac);
      }),
    onSettled: refresh,
  });

  const block = () => {
    if (
      c.you &&
      !window.confirm("This is the device you are using right now. Blocking it cuts you off from the Pi. Block it anyway?")
    )
      return;
    action.mutate("block");
  };

  return (
    <div className="net-actions vstack">
      {c.blocked ? (
        <div className="net-buttons">
          <button type="button" className="btn" disabled={action.isPending} onClick={() => action.mutate("unblock")}>
            <Icon name="ok" />
            Unblock
          </button>
        </div>
      ) : (
        <div className="net-buttons">
          <div className="field net-note">
            <label className="label" htmlFor={`note-${c.mac}`}>
              Note (optional)
            </label>
            <input
              id={`note-${c.mac}`}
              className="input"
              maxLength={100}
              placeholder="Why it is blocked"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-crit" disabled={action.isPending} onClick={block}>
            <Icon name="power" />
            Block
          </button>
          {!c.connected && (
            <button type="button" className="btn" disabled={action.isPending} onClick={() => action.mutate("forget")}>
              <Icon name="trash" />
              Forget
            </button>
          )}
        </div>
      )}
      {action.error && (
        <Banner tone="crit" title="Did not work">
          {action.error.message}
        </Banner>
      )}
    </div>
  );
}
