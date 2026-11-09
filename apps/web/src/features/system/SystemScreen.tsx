import type { HistoryPoint, PowerEvent, Snapshot } from "@offline-pi/api-client";
import { ago, STATUS, utcClock, utcDate, utcDateTime, type LinkState as StripLink } from "@offline-pi/ui/outpost.js";
import { useEffect, useState } from "react";
import { Screen } from "../../app/Screen";
import { useStripItems, useStripLink } from "../../app/strip";
import { Icon } from "../../ui/outpost";
import { ConnectionsCard } from "./ConnectionsCard";
import { ContainersCard } from "./ContainersCard";
import {
  fmtBytes,
  fmtNum,
  fmtRate,
  fmtUptime,
  pctLevel,
  pctTone,
  SEV_RANK,
  tempLevel,
  TONE,
  unitFmt,
  voltLevel,
  type Level,
} from "./format";
import { LineChart, type Range, type Series } from "./LineChart";
import { Bar, Kv, Notice, Readout, SignalBars, SmBadge } from "./parts";
import { useSystemLive, type LinkState } from "./useSystemLive";
import "./system.css";

// Link to this screen's own data source: core's /system live feed.
const LINK: Record<LinkState, [StripLink, string]> = {
  live: ["ok", "CORE · LIVE"],
  connecting: ["cau", "CORE · CONNECTING"],
  reconnecting: ["cau", "CORE · RECONNECTING"],
  error: ["crit", "CORE · NO LINK"],
};

const RANGE_KEY = "pi-monitor-range";
function readRange(): Range {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    if (saved === "live" || saved === "day") return saved;
  } catch {
    /* storage unavailable */
  }
  return "live";
}

const S_TEMP: Series[] = [{ key: "temp", label: "CPU temp", tone: "info", fmt: unitFmt("°C", 1) }];
const S_VOLT: Series[] = [{ key: "volt", label: "Input", tone: "info", fmt: unitFmt("V", 3) }];
const S_CPU: Series[] = [{ key: "cpu", label: "CPU", tone: "info", fmt: unitFmt("%", 1) }];
const S_MEM: Series[] = [{ key: "mem", label: "Memory", tone: "info", fmt: unitFmt("%", 1) }];
const S_NET: Series[] = [
  { key: "rx", label: "Down", tone: "info", fmt: fmtRate },
  { key: "tx", label: "Up", tone: "fg2", dashed: true, fmt: fmtRate },
];

/** System dashboard: health, power, storage, containers, connections of the Pi. */
export function SystemScreen() {
  const { snap: s, live, minutes, events, intervalMs, link } = useSystemLive();
  const [range, setRange] = useState<Range>(readRange);
  const chooseRange = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      /* storage unavailable */
    }
  };

  useStripLink(...LINK[link]);
  useStripItems(stripItems(s, link));

  useEffect(() => {
    if (!s) return;
    const prev = document.title;
    document.title = `${s.system.hostname} · System`;
    return () => {
      document.title = prev;
    };
  }, [s?.system.hostname]);

  const points = range === "live" ? live : minutes;
  const chart = { points, range, intervalMs };
  const health = s ? healthOf(s) : { crit: [], cau: [], past: "" };

  const rangeToggle = (
    <div className="seg range" role="group" aria-label="Chart range">
      {(
        [
          ["live", "15 min"],
          ["day", "24 h"],
        ] as const
      ).map(([r, label]) => (
        <button key={r} type="button" aria-pressed={range === r} onClick={() => chooseRange(r)}>
          {label}
        </button>
      ))}
    </div>
  );
  const context = s
    ? [s.system.model || "Unknown hardware", s.system.os, `Up ${fmtUptime(s.system.uptimeSec)}`].filter(Boolean).join(" · ")
    : "Waiting for the first reading";

  return (
    <Screen module="system" title={s?.system.hostname ?? "Connecting"} actions={rangeToggle} context={context}>
      <div className="sys">
        {health.crit.length > 0 && (
          <div className="sys-pinned" role="alert">
            <Notice tone="crit" title="Attention needed" body={health.crit.join(" ")} />
          </div>
        )}
        <Notices s={s} link={link} health={health} />
        {s && <Dashboard s={s} chart={chart} events={events} />}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------- strip
function stripItems(s: Snapshot | null, link: LinkState) {
  const items: { label: string; value: string }[] = [];
  if (!s) return items;
  if (s.temps.cpu != null) items.push({ label: "TEMP", value: `${fmtNum(s.temps.cpu, 1)}°C` });
  if (s.power.inputVolts != null) items.push({ label: "VOLT", value: `${fmtNum(s.power.inputVolts, 2)} V` });
  else if (s.power.coreVolts != null) items.push({ label: "VCORE", value: `${fmtNum(s.power.coreVolts, 3)} V` });
  if (s.power.psuMaxCurrentMa != null) items.push({ label: "PSU", value: `${(s.power.psuMaxCurrentMa / 1000).toFixed(1)} A` });
  if (link !== "live") items.push({ label: "DATA", value: ago(s.ts / 1000) });
  return items;
}

// ------------------------------------------------------------- health
type Health = { crit: string[]; cau: string[]; past: string };

function healthOf(s: Snapshot): Health {
  const crit: string[] = [];
  const cau: string[] = [];
  const past: string[] = [];
  const t = s.throttle;
  const uv = s.power.underVoltageNow ?? t?.now.underVoltage;
  if (uv) crit.push("Under-voltage right now: the power supply cannot keep up.");
  if (t?.now.throttled) crit.push("CPU is throttled.");
  if (t?.now.freqCapped) cau.push("ARM frequency is capped.");
  if (t?.now.softTempLimit) cau.push("Soft temperature limit active.");
  const tl = tempLevel(s.temps.cpu);
  if (tl && tl !== "good") (tl === "warning" ? cau : crit).push(`CPU temperature is ${fmtNum(s.temps.cpu, 1)} °C.`);
  const vl = voltLevel(s.power.inputVolts);
  if (vl && vl !== "good" && !uv)
    (vl === "warning" ? cau : crit).push(`Input voltage is low (${fmtNum(s.power.inputVolts, 2)} V).`);
  for (const d of s.disks) {
    const pct = (d.used / d.total) * 100;
    if (pct >= 90) (pct >= 95 ? crit : cau).push(`${d.mount} is ${pct.toFixed(0)}% full.`);
  }
  if (s.power.usbOverCurrent) cau.push("USB over-current was detected.");
  for (const c of s.containers?.list ?? []) {
    const name = c.app || c.name;
    if (c.state === "running" && c.health === "unhealthy") cau.push(`${name} is unhealthy.`);
    else if (c.state !== "running" && c.restartPolicy === "always") cau.push(`${name} is not running (${c.state}).`);
  }
  if (t && !t.now.underVoltage && t.sinceBoot.underVoltage) past.push("under-voltage");
  if (t && !t.now.throttled && t.sinceBoot.throttled) past.push("throttling");
  if (t && !t.now.freqCapped && t.sinceBoot.freqCapped) past.push("frequency capping");
  const psu = s.power.psuMaxCurrentMa;
  const pastText = past.length
    ? `Since boot the firmware recorded ${past.join(" and ")}${psu != null && psu < 5000 ? `; the PSU only negotiated ${(psu / 1000).toFixed(1)} A` : ""}.`
    : "";
  return { crit, cau, past: pastText };
}

/** Caution/ok banners and the link-lost notice (the critical one is pinned above). */
function Notices({ s, link, health }: { s: Snapshot | null; link: LinkState; health: Health }) {
  const { crit, cau, past } = health;
  const age = s ? `Showing data from ${ago(s.ts / 1000).toLowerCase()}.` : "No data received yet.";
  return (
    <div className="notices" aria-live="polite">
      {link === "error" && <Notice tone="crit" title="No link to the monitor service" body={`${age} Retrying automatically.`} />}
      {(link === "connecting" || link === "reconnecting") && (
        <Notice
          tone="cau"
          title={link === "connecting" ? "Connecting to the monitor service" : "Link lost, reconnecting"}
          body={age}
        />
      )}
      {s && cau.length > 0 && <Notice tone="cau" title="Check your Pi" body={cau.join(" ")} />}
      {s && past && <Notice tone="cau" title="Power problems since boot" body={past} />}
      {s && !crit.length && !cau.length && !past && <Notice tone="ok" title="All systems normal" />}
    </div>
  );
}

// ------------------------------------------------------------- dashboard
const FLAGS = [
  ["underVoltage", "Under-voltage", "crit"],
  ["throttled", "CPU throttled", "crit"],
  ["freqCapped", "Frequency capped", "cau"],
  ["softTempLimit", "Soft temp limit", "cau"],
] as const;

const EVENT_TEXT: Record<string, [string, string, "crit" | "cau"]> = {
  "under-voltage": ["Under-voltage", "cleared", "crit"],
  throttled: ["CPU throttled", "ended", "crit"],
  "freq-capped": ["Frequency capped", "ended", "cau"],
  "soft-temp-limit": ["Soft temperature limit", "ended", "cau"],
};

function Dashboard({
  s,
  chart,
  events,
}: {
  s: Snapshot;
  chart: { points: HistoryPoint[]; range: Range; intervalMs: number };
  events: PowerEvent[];
}) {
  const sys = s.system;
  const p = s.power;
  const t = s.throttle;
  const m = s.memory;

  // readouts
  const tc = s.temps.cpu;
  const tempLvl = tempLevel(tc);
  const fan = s.fan;
  const voltExtras = [
    p.inputVolts != null && p.coreVolts != null ? `Core ${fmtNum(p.coreVolts, 3)} V` : null,
    p.socWatts != null ? `${fmtNum(p.socWatts, 2)} W` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const voltLvl = p.inputVolts != null ? voltLevel(p.inputVolts) : null;
  const cpuLvl = pctLevel(s.cpu.usage);
  const memPct = m ? (m.used / m.total) * 100 : null;
  const memLvl = pctLevel(memPct);

  // corner brackets on the readout that matters most (the worst one, else temperature)
  const levels: (Level | null)[] = [tempLvl, voltLvl, null, memLvl === "good" ? null : memLvl];
  let focus = 0;
  let rank = 0;
  levels.forEach((l, i) => {
    const r = l ? SEV_RANK[l] : 0;
    if (r > rank) {
      rank = r;
      focus = i;
    }
  });

  const volt =
    p.inputVolts != null
      ? {
          label: "Input 5 V",
          value: fmtNum(p.inputVolts, 2),
          badgeLabel: voltLvl === "good" ? "Normal" : "Low",
          ratio: (p.inputVolts - 4.6) / 0.6,
          meta: voltExtras,
        }
      : p.coreVolts != null
        ? { label: "Core voltage", value: fmtNum(p.coreVolts, 3), ratio: null, meta: voltExtras }
        : { label: "Voltage", value: "--", ratio: null, meta: s.vcgencmd ? "No reading" : "vcgencmd unavailable" };

  const events100 = [...events].reverse().slice(0, 100);

  return (
    <>
      <section className="readouts" aria-label="Key readings">
        <Readout
          label="CPU temp"
          unit="°C"
          value={fmtNum(tc, 1)}
          level={tempLvl}
          ratio={tc == null ? null : tc / 90}
          meta={fan ? `Fan ${fan.rpm ?? "--"} rpm` : "No fan detected"}
          focus={focus === 0}
        />
        <Readout unit="V" level={voltLvl} focus={focus === 1} {...volt} />
        <Readout
          label="CPU usage"
          unit="%"
          value={fmtNum(s.cpu.usage, 0)}
          level={null}
          ratio={s.cpu.usage == null ? null : s.cpu.usage / 100}
          cellTone={cpuLvl ? TONE[cpuLvl] : "ok"}
          meta={`Load ${(s.cpu.load[0] ?? 0).toFixed(2)} · ${s.cpu.cores.length} cores`}
          focus={focus === 2}
        />
        <Readout
          label="Memory"
          unit="%"
          value={fmtNum(memPct, 0)}
          level={memLvl === "good" ? null : memLvl}
          ratio={memPct == null ? null : memPct / 100}
          cellTone={memLvl ? TONE[memLvl] : "ok"}
          meta={m ? `${fmtBytes(m.used)} of ${fmtBytes(m.total)}` : "No reading"}
          focus={focus === 3}
        />
      </section>

      <div className="cards">
        <article className="card">
          <div className="card-head">
            <h2 className="h2">Temperature</h2>
          </div>
          <Kv
            rows={[
              ...s.temps.sensors
                .filter((x) => x.name !== "CPU")
                .map((x): [string, string] => [x.name, `${fmtNum(x.celsius, 1)} °C`]),
              fan
                ? ["Fan", `${fan.rpm ?? "--"} rpm${fan.pwmPercent != null ? ` (${fan.pwmPercent}%)` : ""}`]
                : ["Fan", "not detected"],
              ["Soft temp limit", t ? (t.now.softTempLimit ? "active" : "inactive") : null],
            ]}
          />
          <LineChart {...chart} series={S_TEMP} opts={{ label: "CPU temperature over time", minSpan: 10 }} />
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Power</h2>
          </div>
          <Kv
            rows={[
              ["Input voltage", p.inputVolts != null ? `${fmtNum(p.inputVolts, 3)} V` : null],
              ["Core voltage", p.coreVolts != null ? `${fmtNum(p.coreVolts, 3)} V` : null],
              ["Board power (PMIC)", p.socWatts != null ? `${fmtNum(p.socWatts, 2)} W` : null],
              [
                "PSU max current",
                p.psuMaxCurrentMa != null
                  ? `${(p.psuMaxCurrentMa / 1000).toFixed(1)} A${p.psuMaxCurrentMa < 5000 ? " (not 5 A)" : ""}`
                  : null,
              ],
              ["USB current limit", p.usbHighCurrent == null ? null : p.usbHighCurrent ? "1.6 A" : "600 mA"],
              ["USB over-current", p.usbOverCurrent == null ? null : p.usbOverCurrent ? "DETECTED" : "no"],
              !s.vcgencmd && ["vcgencmd", "unavailable"],
            ]}
          />
          <LineChart
            {...chart}
            hidden={p.inputVolts == null}
            series={S_VOLT}
            opts={{ label: "Input voltage over time", minSpan: 0.2, axisFmt: (v) => v.toFixed(2) }}
          />
          {p.rails.length > 0 && (
            <details className="details">
              <summary className="label">PMIC rails</summary>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rail</th>
                      <th className="num">Volts</th>
                      <th className="num">Amps</th>
                      <th className="num">Watts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rails.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td className="num">{fmtNum(r.volts, 3)}</td>
                        <td className="num">{fmtNum(r.amps, 3)}</td>
                        <td className="num">{r.volts != null && r.amps != null ? fmtNum(r.volts * r.amps, 2) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Throttle flags</h2>
            <span className="label">{t?.raw ?? ""}</span>
          </div>
          <p className="help">Firmware power and thermal flags, now and since boot.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Now</th>
                  <th>Since boot</th>
                </tr>
              </thead>
              <tbody>
                {!t && p.underVoltageNow == null ? (
                  <tr>
                    <td colSpan={3} className="fg3">
                      {s.vcgencmd ? "No flags reported." : "vcgencmd unavailable: no throttle flags."}
                    </td>
                  </tr>
                ) : (
                  FLAGS.map(([k, label, tone]) => {
                    const now = k === "underVoltage" ? (p.underVoltageNow ?? t?.now.underVoltage) : t?.now[k];
                    const boot = t?.sinceBoot[k];
                    return (
                      <tr key={k}>
                        <td>{label}</td>
                        <td>
                          {now == null ? (
                            <SmBadge tone="off">n/a</SmBadge>
                          ) : now ? (
                            <SmBadge tone={tone}>Active</SmBadge>
                          ) : (
                            <SmBadge tone="ok">No</SmBadge>
                          )}
                        </td>
                        <td>
                          {boot == null ? (
                            <SmBadge tone="off">n/a</SmBadge>
                          ) : boot ? (
                            <SmBadge tone="cau">Seen</SmBadge>
                          ) : (
                            <SmBadge tone="ok">No</SmBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">CPU</h2>
          </div>
          <div className="cores">
            {s.cpu.cores.map((c, i) => {
              const mhz = s.cpu.freqMhz[i];
              return (
                <div className="core" key={i}>
                  <div className="progress-head">
                    <span className="label">Core {i}</span>
                    <span className="data">
                      {fmtNum(c, 0)}%{mhz ? ` · ${mhz} MHz` : ""}
                    </span>
                  </div>
                  <Bar ratio={c / 100} cells={20} tone={pctTone(pctLevel(c))} label={`Core ${i} usage`} />
                </div>
              );
            })}
          </div>
          <Kv
            rows={[
              ["Load 1/5/15 min", s.cpu.load.map((l) => l.toFixed(2)).join(" / ")],
              ["Max frequency", s.cpu.maxFreqMhz ? `${s.cpu.maxFreqMhz} MHz` : null],
              ["Frequency capped", t ? (t.now.freqCapped ? "YES" : "no") : null],
              ["Throttled", t ? (t.now.throttled ? "YES" : "no") : null],
            ]}
          />
          <LineChart {...chart} series={S_CPU} opts={{ label: "CPU usage over time", min: 0, ceil: 100 }} />
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Memory</h2>
          </div>
          {m && (
            <Kv
              rows={[
                ["Used", fmtBytes(m.used)],
                ["Available", fmtBytes(m.available)],
                ["Total", fmtBytes(m.total)],
                ["Swap", m.swapTotal ? `${fmtBytes(m.swapUsed)} of ${fmtBytes(m.swapTotal)}` : "off"],
              ]}
            />
          )}
          <LineChart {...chart} series={S_MEM} opts={{ label: "Memory usage over time", min: 0, ceil: 100 }} />
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Storage</h2>
          </div>
          <div className="disks">
            {!s.disks.length && <p className="help">No block devices visible.</p>}
            {s.disks.map((d) => {
              const pct = (d.used / d.total) * 100;
              return (
                <div className="disk" key={d.mount}>
                  <div className="progress-head">
                    <span className="data disk-mount">
                      {d.mount}{" "}
                      {pct >= 90 && (
                        <SmBadge tone={pct >= 95 ? "crit" : "cau"}>{pct >= 95 ? "Full" : "Nearly full"}</SmBadge>
                      )}
                    </span>
                    <span className="data fg2">
                      {pct.toFixed(0)}% · {fmtBytes(d.used)} / {fmtBytes(d.total)}
                    </span>
                  </div>
                  <Bar
                    ratio={pct / 100}
                    cells={32}
                    tone={pct >= 95 ? "crit" : pct >= 90 ? "cau" : undefined}
                    label={`${d.mount} used`}
                  />
                  <span className="label">
                    {fmtBytes(d.free)} free · {d.device} · {d.fstype}
                  </span>
                </div>
              );
            })}
          </div>
          <Kv
            rows={
              s.diskIo
                ? [
                    ["Disk read", fmtRate(s.diskIo.readBps)],
                    ["Disk write", fmtRate(s.diskIo.writeBps)],
                  ]
                : []
            }
          />
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Network</h2>
            {s.wifi && (
              <span className="wifi" aria-label={`Wi-Fi signal ${s.wifi.signalDbm} dBm, ${s.wifi.quality}%`}>
                <SignalBars level={s.wifi.quality / 20} />
                <span className="data">{s.wifi.signalDbm} dBm</span>
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Interface</th>
                  <th className="num">Down</th>
                  <th className="num">Up</th>
                </tr>
              </thead>
              <tbody>
                {s.network.length ? (
                  s.network.map((n) => (
                    <tr key={n.iface}>
                      <td>{n.iface}</td>
                      <td className="num">{fmtRate(n.rxBps)}</td>
                      <td className="num">{fmtRate(n.txBps)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="fg3">
                      No interfaces.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Kv
            rows={[
              s.wifi && [`Wi-Fi (${s.wifi.iface})`, `${s.wifi.signalDbm} dBm (${s.wifi.quality}%)`],
              ...sys.addresses.map((a): [string, string] => [`IP ${a.iface}`, a.address]),
            ]}
          />
          <div className="legend">
            <span className="sw-rx">Download</span>
            <span className="sw-tx">Upload (dashed)</span>
          </div>
          <LineChart
            {...chart}
            series={S_NET}
            opts={{ label: "Network throughput over time", min: 0, minSpan: 1024, axisFmt: (v) => fmtBytes(v, 0) }}
          />
        </article>

        <ContainersCard info={s.containers} />
        <ConnectionsCard conn={s.connections} />

        <article className="card">
          <div className="card-head">
            <h2 className="h2">System</h2>
          </div>
          <Kv
            rows={[
              ["Hostname", sys.hostname],
              ["Model", sys.model],
              ["OS", sys.os],
              ["Kernel", sys.kernel],
              ["Architecture", sys.arch],
              ["Uptime", fmtUptime(sys.uptimeSec)],
              ["Processes", sys.processes],
              ["Last update", `${utcDate(s.ts)} ${utcClock(s.ts)}`],
            ]}
          />
        </article>

        <article className="card">
          <div className="card-head">
            <h2 className="h2">Power events</h2>
          </div>
          <p className="help">Changes of the firmware's under-voltage and throttling flags, newest first.</p>
          <ul className="list">
            {events100.length ? (
              events100.map((e, i) => {
                const [name, endWord, tone] = EVENT_TEXT[e.kind] ?? [e.kind, "ended", "cau"];
                const tn = e.active ? tone : "ok";
                return (
                  <li key={`${e.t}-${e.kind}-${i}`}>
                    <div className="row static">
                      <Icon name={STATUS[tn].icon} className={`i-${tn}`} />
                      <div className="row-main">
                        <span className="row-title">
                          {name}
                          {e.active ? "" : ` ${endWord}`}
                        </span>
                        <span className="row-meta">{utcDateTime(e.t)}</span>
                      </div>
                      <span className="row-value">
                        <SmBadge tone={tn}>{e.active ? "Started" : endWord}</SmBadge>
                      </span>
                    </div>
                  </li>
                );
              })
            ) : (
              <li>
                <div className="row static">
                  <span className="row-main fg2 body-sm">No events recorded.</span>
                </div>
              </li>
            )}
          </ul>
        </article>
      </div>
    </>
  );
}
