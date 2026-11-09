// Thin React bindings for the shared Outpost UI package (src/outpost-ui, a
// synced copy of /ui). Markup and behaviour come from the package; these only
// adapt it to React's lifecycle.
import { useEffect, useRef, useState } from "react";
import {
  getTheme,
  holdToConfirm,
  iconHref,
  progress,
  STATUS,
  type StatusState,
  type Theme,
} from "./outpost-ui/outpost.js";

/** Sprite icon, decorative unless the parent labels it. */
export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg className={`i ${className}`.trim()} aria-hidden="true" focusable="false">
      <use href={iconHref(name)} />
    </svg>
  );
}

/** Status badge: colour + fixed shape + written label. */
export function Badge({
  state,
  children,
  className = "",
}: {
  state: StatusState;
  children: React.ReactNode;
  className?: string;
}) {
  const s = STATUS[state];
  return (
    <span className={`badge ${state === "off" ? "" : `badge-${s.cls}`} ${className}`.trim()}>
      <Icon name={s.icon} />
      {children}
    </span>
  );
}

/** Current Outpost theme, following the `outpost:theme` event. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => {
    const onTheme = () => setTheme(getTheme());
    window.addEventListener("outpost:theme", onTheme);
    return () => window.removeEventListener("outpost:theme", onTheme);
  }, []);
  return theme;
}

/**
 * Hold-to-confirm button (DESIGN.md: delete region). The package owns the
 * button's children, so React renders it empty.
 */
export function HoldButton({
  label,
  onConfirm,
  disabled,
  className = "",
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const confirm = useRef(onConfirm);
  confirm.current = onConfirm;

  useEffect(() => {
    if (!ref.current) return;
    return holdToConfirm(ref.current, () => confirm.current(), { label });
  }, [label]);

  return <button ref={ref} type="button" className={`btn hold ${className}`.trim()} disabled={disabled} />;
}

/** Segmented progress bar (.progress), ratio 0..1. */
export function Progress({ ratio }: { ratio: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) progress(ref.current, ratio);
  }, [ratio]);
  return <div ref={ref} className="progress" />;
}

const BANNER_ICON = { info: "info", cau: "caution", crit: "critical" } as const;

/** Banner: icon + title + body (+ optional action). Critical ones announce. */
export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: keyof typeof BANNER_ICON;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "crit" ? "alert" : undefined}>
      <Icon name={BANNER_ICON[tone]} />
      <div className="banner-text">
        <span className="banner-title">{title}</span>
        {children && <span className="banner-body">{children}</span>}
      </div>
      {action}
    </div>
  );
}
