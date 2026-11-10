import type { ConnectionsInfo, ListeningSocket } from "@outpost/api-client";
import { useState } from "react";

const MAX_ROWS = 60;
const LOOPBACK_KEY = "pi-monitor-loopback";

function readLoopback(): boolean {
  try {
    return localStorage.getItem(LOOPBACK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Connections: counters, listening ports and active TCP connections. */
export function ConnectionsCard({ conn }: { conn: ConnectionsInfo | null }) {
  const [showLoopback, setShowLoopback] = useState(readLoopback);
  const toggle = (on: boolean) => {
    setShowLoopback(on);
    try {
      localStorage.setItem(LOOPBACK_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  // one row per port and service: IPv4 and IPv6 sockets are merged
  const groups = new Map<string, ListeningSocket & { addresses: string[] }>();
  for (const l of conn?.listening ?? []) {
    if (!showLoopback && l.loopback) continue;
    const key = `${l.port}|${l.service}`;
    const g = groups.get(key) ?? { ...l, addresses: [] };
    g.addresses.push(l.address);
    groups.set(key, g);
  }
  const listening = [...groups.values()];
  const est = (conn?.established ?? []).filter((e) => showLoopback || !e.loopback);
  const shown = est.slice(0, MAX_ROWS);
  const more = conn ? est.length - shown.length + (conn.totalEstablished - conn.established.length) : 0;

  return (
    <article className="card wide">
      <div className="card-head">
        <h2 className="h2">Connections</h2>
        <label className="check">
          <input type="checkbox" checked={showLoopback} onChange={(e) => toggle(e.target.checked)} />{" "}
          <span className="body-sm">Show loopback</span>
        </label>
      </div>
      {conn && (
        <>
          <div className="cellrow stats">
            <Stat label="Established" n={conn.totalEstablished} />
            <Stat label="Remote hosts" n={conn.remoteHosts} />
            <Stat label="Open to LAN" n={new Set(conn.listening.filter((l) => !l.loopback).map((l) => l.port)).size} />
            <Stat label="Time-wait" n={conn.counts.TIME_WAIT ?? 0} />
          </div>
          <div className="conn-cols">
            <section>
              <h3 className="label">Listening ports</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">Port</th>
                      <th>Address</th>
                      <th>Service</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listening.length ? (
                      listening.map((l) => (
                        <tr key={`${l.port}|${l.service}`}>
                          <td className="num">{l.port}</td>
                          <td>{l.addresses.join(", ")}</td>
                          <td>
                            {l.service || "--"}
                            {l.container && l.process && <span className="sub">{l.process}</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="fg3">
                          None.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3 className="label">Active connections</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Remote</th>
                      <th className="num">Local port</th>
                      <th>Service</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length ? (
                      shown.map((e) => (
                        <tr key={`${e.direction}|${e.remoteAddress}|${e.remotePort}|${e.localAddress}|${e.localPort}`}>
                          <td>{e.direction === "in" ? "↓ IN" : "↑ OUT"}</td>
                          <td>
                            {e.remoteAddress}:{e.remotePort}
                          </td>
                          <td className="num">{e.localPort}</td>
                          <td>
                            {e.service || "--"}
                            {e.process && e.process !== e.service && <span className="sub">{e.process}</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="fg3">
                          No active connections.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {more > 0 && <p className="help">+ {more} more not shown</p>}
            </section>
          </div>
        </>
      )}
    </article>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <span className="label">{label}</span>
      <span className="data stat-num">{n}</span>
    </div>
  );
}
