import { useLogsSources, type LogEntry, type LogSource } from "@outpost/api-client";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Screen } from "../../app/Screen";
import { Banner, Icon } from "../../ui/outpost";
import { useLogs, type FollowState } from "./useLogs";
import "./logs.css";

/** Least severe level shown: each filter shows its level and everything more severe. */
const FILTERS = [
  { id: "all", label: "All", min: 5 },
  { id: "log", label: "Info+", min: 3 },
  { id: "warn", label: "Warn+", min: 2 },
  { id: "error", label: "Errors", min: 1 },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** fatal 0 ... verbose 5 */
const RANK: Record<LogEntry["level"], number> = { fatal: 0, error: 1, warn: 2, log: 3, debug: 4, verbose: 5 };

const TAILS = [200, 500, 1000, 2000, 5000];

/** Lines drawn at once; filters and search still see every loaded line. */
const MAX_DRAWN = 2000;

const WORD: Record<FollowState, string> = { live: "LIVE", connecting: "CONNECTING", paused: "PAUSED", ended: "ENDED" };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** HH:MM:SS.mmm in UTC (DESIGN.md: times in UTC). */
function utcStamp(ts: number | null): string {
  if (ts == null) return "--:--:--.---";
  const d = new Date(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

function asText(source: string, entries: LogEntry[]): string {
  return entries
    .map((e) => {
      const ts = e.ts == null ? "-" : new Date(e.ts).toISOString();
      return `${ts} ${e.level.toUpperCase().padEnd(7)} ${e.context ? `[${e.context}] ` : ""}${e.message}`;
    })
    .join("\n")
    .concat("\n", `# outpost logs · ${source} · ${new Date().toISOString()}\n`);
}

function download(source: string, entries: LogEntry[]) {
  const blob = new Blob([asText(source, entries)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outpost-${source}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Logs: the lines of core and every installed module, live, filterable. */
export function LogsScreen({ source }: { source: string }) {
  const navigate = useNavigate();
  const sources = useLogsSources({ query: { refetchInterval: 10_000 } });
  const list = sources.data?.sources ?? [];
  const current: LogSource | undefined = list.find((s) => s.id === source);
  const label = current?.label ?? source;

  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [tail, setTail] = useState(500);
  const [paused, setPaused] = useState(false);
  const logs = useLogs(source, tail, paused);

  const min = FILTERS.find((f) => f.id === filter)!.min;
  const shown = useMemo(
    () =>
      logs.entries.filter(
        (e) =>
          RANK[e.level] <= min &&
          (!query || e.message.toLowerCase().includes(query) || (e.context ?? "").toLowerCase().includes(query)),
      ),
    [logs.entries, min, query],
  );
  const drawn = shown.length > MAX_DRAWN ? shown.slice(-MAX_DRAWN) : shown;
  const counts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const e of logs.entries) {
      if (RANK[e.level] <= 1) errors++;
      else if (e.level === "warn") warnings++;
    }
    return { errors, warnings };
  }, [logs.entries]);

  const failed = logs.error || logs.page?.available === false;

  // stick to the newest line unless the user scrolled up
  const viewRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const onScroll = () => {
    const el = viewRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [drawn]);
  useEffect(() => {
    stick.current = true;
  }, [source, filter, query]);

  const pick = (id: string) => void navigate({ to: "/logs", search: id === "core" ? {} : { source: id } });

  return (
    <Screen
      module="logs"
      title={label}
      context={failed ? undefined : `${counts.errors} ERR · ${counts.warnings} WARN`}
      actions={
        <>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={paused}
            aria-label={paused ? "Resume live lines" : "Pause live lines"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Download the shown lines"
            title="Download"
            disabled={!shown.length}
            onClick={() => download(source, shown)}
          >
            <Icon name="download" />
          </button>
        </>
      }
    >
      <div className="logs">
        <section className="card logs-controls" aria-label="Log source and filters">
          <div className="chips" role="group" aria-label="Source">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                aria-pressed={s.id === source}
                onClick={() => pick(s.id)}
              >
                <span className={`led ${s.state === "running" ? "led-ok" : "led-off"}`} aria-hidden="true" />
                {s.label}
                {s.state !== "running" && <span className="sr-only"> ({s.state})</span>}
              </button>
            ))}
          </div>
          <div className="logs-filters">
            <div className="seg" role="group" aria-label="Level">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="search logs-search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                aria-label="Filter lines"
                placeholder="Filter lines, e.g. timeout"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              className="select logs-tail"
              aria-label="Lines to load"
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
            >
              {TAILS.map((n) => (
                <option key={n} value={n}>
                  Last {n}
                </option>
              ))}
            </select>
          </div>
        </section>

        {sources.data?.containerError && source !== "core" && (
          <Banner tone="cau" title="Container logs unavailable">
            {sources.data.containerError}
          </Banner>
        )}
        {logs.error && (
          <Banner tone="crit" title="Could not load the logs">
            {logs.error.message}
          </Banner>
        )}
        {logs.page?.available === false && (
          <Banner tone="crit" title={`No logs from ${label}`}>
            {logs.page.error}
          </Banner>
        )}
        {logs.state === "ended" && (
          <Banner
            tone="info"
            title="Live lines stopped"
            action={
              <button type="button" className="btn btn-sm" onClick={logs.resume}>
                Resume
              </button>
            }
          >
            {logs.endedMessage}
          </Banner>
        )}

        <section className="card logs-card" aria-label={`Log lines of ${label}`}>
          <div className="card-head">
            <h2 className="h2">Lines</h2>
            <span className="status label">
              <span className={`led led-${logs.state === "live" ? "ok" : "cau"} is-live`} aria-hidden="true" />
              <span>
                {WORD[logs.state]} · {shown.length === logs.entries.length ? shown.length : `${shown.length} / ${logs.entries.length}`}
                {shown.length > MAX_DRAWN && ` · newest ${MAX_DRAWN} shown`}
              </span>
            </span>
          </div>
          <div className="logs-view" ref={viewRef} onScroll={onScroll} tabIndex={0} aria-label="Log lines">
            {logs.isLoading ? (
              <p className="logs-empty fg3">Loading…</p>
            ) : !drawn.length ? (
              <p className="logs-empty fg3">
                {logs.entries.length ? "No line matches the filter." : "No lines yet. New ones appear here as they are written."}
              </p>
            ) : (
              <ol className="logs-lines">
                {drawn.map((e, i) => (
                  <Line key={i} e={e} />
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </Screen>
  );
}

const LEVEL_ICON: Partial<Record<LogEntry["level"], string>> = { fatal: "critical", error: "critical", warn: "caution" };

function Line({ e }: { e: LogEntry }) {
  const icon = LEVEL_ICON[e.level];
  return (
    <li className={`log-line is-${e.level}`}>
      <time className="log-ts" dateTime={e.ts == null ? undefined : new Date(e.ts).toISOString()}>
        {utcStamp(e.ts)}
      </time>
      <span className="log-level">
        {icon && <Icon name={icon} className="i-xs" />}
        {e.level}
      </span>
      <span className="log-msg">
        {e.context && <span className="log-ctx">[{e.context}] </span>}
        {e.message}
      </span>
    </li>
  );
}
