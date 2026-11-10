import type { HistoryPoint } from "@outpost/api-client";
import { utcClock, utcDate, utcDateTime, utcTime } from "@outpost/ui/outpost.js";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { fmtNum } from "./format";
import { LIVE_WINDOW } from "./useSystemLive";

export type Range = "live" | "day";
type Key = Exclude<keyof HistoryPoint, "t">;

export type Series = {
  key: Key;
  label: string;
  /** colour class: tone-info / tone-fg2 (currentColor) */
  tone: "info" | "fg2";
  dashed?: boolean;
  fmt: (v: number | null | undefined) => string;
};

export type ChartOpts = {
  /** accessible name of the chart */
  label: string;
  min?: number;
  max?: number;
  floor?: number;
  ceil?: number;
  minSpan?: number;
  axisFmt?: (v: number) => string;
};

const PAD = { l: 44, r: 8, t: 6, b: 18 };

/** The chart box's size, following resizes. */
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Minimal SVG line chart with a crosshair tooltip, dependency-free.
 * Colours come from CSS classes (tone-info, tone-fg2) via currentColor.
 * One series gets an area fill; several get a dot on their last point.
 */
export function LineChart({
  points,
  series,
  opts,
  range,
  intervalMs,
  hidden,
}: {
  points: HistoryPoint[];
  series: Series[];
  opts: ChartOpts;
  range: Range;
  intervalMs: number;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const [hover, setHover] = useState<{ index: number; clientX: number; top: number } | null>(null);

  // ---------------------------------------------------------- scales
  const now = Date.now();
  const t0 = range === "live" ? now - LIVE_WINDOW : (points[0]?.t ?? now - 864e5);
  const t1 = range === "live" ? now : Math.max(now, points.at(-1)?.t ?? now);
  let lo = opts.min ?? Infinity;
  let hi = opts.max ?? -Infinity;
  for (const p of points)
    for (const s of series) {
      const v = p[s.key];
      if (v == null) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (opts.floor != null) lo = Math.min(lo, opts.floor);
  if (opts.ceil != null) hi = Math.max(hi, opts.ceil);
  if (hi - lo < (opts.minSpan ?? 1e-9)) {
    const mid = (hi + lo) / 2;
    const span = opts.minSpan ?? 1;
    lo = mid - span / 2;
    hi = mid + span / 2;
  }
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (h - PAD.t - PAD.b);

  const axisTime = (t: number) => (range === "day" ? `${utcDate(t).slice(5)} ${utcTime(t)}` : utcTime(t));
  const tipTime = (t: number) => (range === "day" ? utcDateTime(t) : utcClock(t));
  const fmtAxis = opts.axisFmt ?? ((v: number) => fmtNum(v, 0));

  // ---------------------------------------------------------- hover
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!points.length || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.t) - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover({ index: best, clientX: e.clientX, top: rect.top });
  };
  const hovered = hover ? points[hover.index] : undefined;

  // keep the tooltip inside the window (it needs its own width for that)
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || !hover) return;
    const tw = tip.offsetWidth;
    let left = hover.clientX + 14;
    if (left + tw > window.innerWidth - 8) left = hover.clientX - tw - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, hover.top + 4)}px`;
  });

  // ---------------------------------------------------------- lines
  const gapMs = (range === "live" ? intervalMs : 60e3) * 3;
  const paths = series.map((s) => {
    // split into segments at gaps (e.g. while the service was down)
    const segs: [string, string][][] = [];
    let cur: [string, string][] | null = null;
    let prevT = 0;
    for (const p of points) {
      const v = p[s.key];
      if (v == null) {
        cur = null;
        continue;
      }
      if (!cur || p.t - prevT > gapMs) {
        cur = [];
        segs.push(cur);
      }
      cur.push([x(p.t).toFixed(1), y(v).toFixed(1)]);
      prevT = p.t;
    }
    if (!segs.length) return null;
    const d = segs.map((seg) => "M" + seg.map((q) => q.join(",")).join("L")).join("");
    const base = y(lo).toFixed(1);
    const area =
      series.length === 1
        ? segs.map((seg) => `M${seg[0]![0]},${base}L${seg.map((q) => q.join(",")).join("L")}L${seg.at(-1)![0]},${base}Z`).join("")
        : null;
    const lp = segs.at(-1)!.at(-1)!;
    return (
      <g key={s.key} className={`series tone-${s.tone}`}>
        {area && <path className="area" d={area} />}
        <path className={`line${s.dashed ? " dashed" : ""}`} d={d} />
        {series.length > 1 && <circle className="dot" cx={lp[0]} cy={lp[1]} r={3} />}
      </g>
    );
  });

  const grid = [0, 1, 2].map((i) => {
    const v = lo + ((hi - lo) * i) / 2;
    const yy = y(v);
    return (
      <g key={i}>
        <line className="gridline" x1={PAD.l} x2={w - PAD.r} y1={yy} y2={yy} />
        <text className="axis" x={PAD.l - 6} y={yy + 3} textAnchor="end">
          {fmtAxis(v)}
        </text>
      </g>
    );
  });

  return (
    <div className="chart" ref={ref} hidden={hidden} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {w > 0 && h > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={opts.label}>
          {grid}
          <text className="axis" x={PAD.l} y={h - 4}>
            {axisTime(t0)}
          </text>
          <text className="axis" x={w - PAD.r} y={h - 4} textAnchor="end">
            NOW
          </text>
          {!points.length && (
            <text className="axis" x={w / 2} y={h / 2} textAnchor="middle">
              COLLECTING DATA
            </text>
          )}
          {paths}
          {hovered && (
            <g className="hover">
              <line className="cross" x1={x(hovered.t)} x2={x(hovered.t)} y1={PAD.t} y2={h - PAD.b} />
              {series.map((s) => {
                const v = hovered[s.key];
                return v == null ? null : (
                  <circle key={s.key} className={`dot tone-${s.tone}`} cx={x(hovered.t)} cy={y(v)} r={4} />
                );
              })}
            </g>
          )}
        </svg>
      )}
      {hovered && (
        <div ref={tipRef} className="tooltip" role="status">
          <div className="tooltip-time">{tipTime(hovered.t)}</div>
          {series.map((s) => (
            <div key={s.key}>
              <i className={`sw tone-${s.tone}`} />
              {s.label} <b>{s.fmt(hovered[s.key])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
