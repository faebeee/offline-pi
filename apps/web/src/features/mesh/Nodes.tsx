import type { MeshNode } from "@offline-pi/api-client";
import { ago, coords, distance } from "@offline-pi/ui/outpost.js";
import { Link, useRouter } from "@tanstack/react-router";
import { Fragment, useState, type ReactNode } from "react";
import { Icon, Illustration } from "../../ui/outpost";
import { useModules } from "../modules/useModules";
import { batteryText, distanceM, hex, hopsText } from "./format";
import { useMesh, useTick } from "./useMesh";

/** Node list: this Pi first, then by last heard; rows expand to details. */
export function Nodes() {
  const mesh = useMesh();
  const router = useRouter();
  const modules = useModules().data?.modules.filter((m) => m.installed) ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useTick();

  // the Mesh map module (all nodes, this one opened) if installed, else Maps
  // centred on the position; the hash is the map camera in both
  const mapLink = (n: MeshNode): string | null => {
    if (n.latitude == null || n.longitude == null) return null;
    const camera = `#14/${n.latitude.toFixed(5)}/${n.longitude.toFixed(5)}`;
    const meshMap = modules.find((m) => m.id === "mesh-map");
    if (meshMap) return `${meshMap.path}?node=${encodeURIComponent(n.nodeId || hex(n.num))}${camera}`;
    const maps = modules.find((m) => m.id === "maps");
    return maps ? `${maps.path}${camera}` : null;
  };

  const me = mesh.status.nodeNum != null ? mesh.nodes.get(mesh.status.nodeNum) : undefined;
  const nodes = [...mesh.nodeList].sort(
    (a, b) => Number(mesh.isMe(b.num)) - Number(mesh.isMe(a.num)) || (b.lastHeard || 0) - (a.lastHeard || 0),
  );

  const toggle = (num: number) =>
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });

  return (
    <section className="mesh-nodes grid-bg" role="tabpanel" aria-labelledby="mesh-tab-nodes">
      {nodes.length === 0 ? (
        <div className="empty">
          <Illustration name="mesh" />
          <p className="empty-title">No nodes heard yet</p>
          <p>Nodes appear here as soon as the radio hears them. That can take a few minutes after start-up.</p>
        </div>
      ) : (
        <ul className="list node-list">
          {nodes.map((n) => {
            const mine = mesh.isMe(n.num);
            const m = mine ? null : distanceM(me, n);
            const open = expanded.has(n.num);
            const detailId = `mesh-node-${n.num}`;

            const meta = [n.nodeId || hex(n.num)];
            if (!mine) {
              meta.push(ago(n.lastHeard));
              const hops = hopsText(n.hopsAway);
              if (hops) meta.push(hops);
              if (n.snr != null) meta.push(`SNR ${n.snr} dB`);
            }
            const value = m != null ? distance(m) : batteryText(n.battery);

            const rows: [string, ReactNode][] = [];
            const add = (k: string, v: string | null | undefined) => {
              if (v != null && v !== "") rows.push([k, v]);
            };
            if (!mine) {
              add("Last heard", ago(n.lastHeard));
              add("Hops", hopsText(n.hopsAway));
              add("SNR", n.snr == null ? null : `${n.snr} dB`);
            }
            add("Battery", n.battery == null ? null : `${batteryText(n.battery)}${n.voltage ? ` · ${n.voltage} V` : ""}`);
            add("Distance", m == null ? null : distance(m));
            add("Position", n.latitude == null || n.longitude == null ? null : coords(n.latitude, n.longitude));
            add("Hardware", n.hwModel?.replaceAll("_", " "));
            if (mine) {
              add("Firmware", mesh.status.firmware);
              add("Radio", [mesh.status.region, mesh.status.preset].filter(Boolean).join(" · "));
            }
            const href = mapLink(n);

            return (
              <li key={n.num} className={open ? "is-open" : undefined}>
                <button
                  type="button"
                  className="row has-mono"
                  aria-expanded={open}
                  aria-controls={detailId}
                  onClick={() => toggle(n.num)}
                >
                  <span className="monogram" aria-hidden="true">
                    {n.shortName || hex(n.num).slice(-4)}
                  </span>
                  <span className="row-main">
                    <span className="row-title">{n.longName || hex(n.num)}</span>
                    <span className="row-meta">{meta.join(" · ")}</span>
                  </span>
                  {mine && (
                    <span className="badge badge-sm">
                      <Icon name="mesh" />
                      THIS PI
                    </span>
                  )}
                  {value && <span className="row-value">{value}</span>}
                  <Icon name="chevron" className="row-chevron" />
                </button>
                <div className="node-detail" id={detailId} hidden={!open}>
                  {rows.length > 0 && (
                    <dl className="kv">
                      {rows.map(([k, v]) => (
                        <Fragment key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                  {(!mine || href) && (
                    <div className="node-actions">
                      {!mine && (
                        <Link to="/mesh" search={{ conv: `dm:${n.num}` }} className="btn">
                          <Icon name="message" />
                          Message
                        </Link>
                      )}
                      {href && (
                        <a
                          className="btn"
                          href={href}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            router.history.push(href);
                          }}
                        >
                          <Icon name="map" />
                          Show on map
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
