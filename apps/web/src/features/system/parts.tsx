import { STATUS, type StatusState } from "@offline-pi/ui/outpost.js";
import { Fragment, type ReactNode } from "react";
import { Badge, Icon } from "../../ui/outpost";
import { SEV_LABEL, TONE, type Level } from "./format";

const clamp01 = (r: number) => Math.max(0, Math.min(1, r || 0));

/** Small status badge: colour + fixed shape + word. */
export function SmBadge({ tone, children }: { tone: StatusState; children: ReactNode }) {
  return (
    <Badge state={tone} className="badge-sm">
      {children}
    </Badge>
  );
}

/** .cells: `count` segments, ratio 0..1, tone ok/cau/crit. */
export function Cells({ ratio, tone, count = 10 }: { ratio: number; tone: "ok" | "cau" | "crit"; count?: number }) {
  const lit = Math.round(clamp01(ratio) * count);
  const cls = tone === "cau" ? " is-cau" : tone === "crit" ? " is-crit" : "";
  return (
    <div className={`cells${cls}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={i < lit ? "on" : undefined} />
      ))}
    </div>
  );
}

/** Segmented .progress bar (same markup as outpost.js progress()). */
export function Bar({ ratio, cells, tone, label }: { ratio: number; cells: number; tone?: "cau" | "crit"; label: string }) {
  const r = clamp01(ratio);
  const lit = Math.round(r * cells);
  return (
    <div
      className={`progress${tone ? ` is-${tone}` : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(r * 100)}
      aria-label={label}
    >
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < lit ? "on" : undefined} />
      ))}
    </div>
  );
}

/** Signal bars (.bars), level 0..5. */
export function SignalBars({ level }: { level: number }) {
  const lit = Math.max(0, Math.min(5, Math.round(level)));
  return (
    <span className="bars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < lit ? "on" : undefined} />
      ))}
    </span>
  );
}

export type KvRow = [string, string | number | null | undefined] | null | false;

/** Key/value list; rows without a value are left out. */
export function Kv({ rows }: { rows: KvRow[] }) {
  return (
    <dl className="kv">
      {rows
        .filter((r): r is [string, string | number] => !!r && r[1] != null && r[1] !== "")
        .map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </Fragment>
        ))}
    </dl>
  );
}

/** Banner of any tone, ok included (the shared Banner has no ok variant). */
export function Notice({ tone, title, body }: { tone: "info" | "ok" | "cau" | "crit"; title: string; body?: string }) {
  return (
    <div className={`banner banner-${tone}`}>
      <Icon name={STATUS[tone].icon} />
      <div className="banner-text">
        <div className="banner-title">{title}</div>
        {body && <div className="banner-body">{body}</div>}
      </div>
    </div>
  );
}

/** Readout: big mono value, severity badge (icon + word), cells, meta line. */
export function Readout({
  label,
  unit,
  value,
  level,
  badgeLabel,
  ratio,
  cellTone,
  meta,
  focus,
}: {
  label: string;
  unit: string;
  value: string;
  level: Level | null;
  badgeLabel?: string;
  ratio: number | null;
  cellTone?: "ok" | "cau" | "crit";
  meta?: string;
  focus: boolean;
}) {
  return (
    <div className={`readout${focus ? " brackets" : ""}`}>
      <div className="readout-head">
        <span className="label">{label}</span>
        <span className="ro-badge">{level && <SmBadge tone={TONE[level]}>{badgeLabel ?? SEV_LABEL[level]}</SmBadge>}</span>
      </div>
      <div>
        <span className="readout-value">{value}</span>
        <span className="readout-unit">{unit}</span>
      </div>
      {ratio != null && <Cells ratio={ratio} tone={cellTone ?? (level ? TONE[level] : "ok")} />}
      <div className="readout-meta">{meta ?? ""}</div>
    </div>
  );
}
