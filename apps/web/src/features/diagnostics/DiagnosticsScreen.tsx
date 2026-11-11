import { useDiagnosticsRun, type DiagCheck, type DiagnosticsReport } from "@outpost/api-client";
import type { StatusState } from "@outpost/ui/outpost.js";
import { useMemo, useState } from "react";
import { Screen } from "../../app/Screen";
import { Banner, Icon } from "../../ui/outpost";
import { SmBadge } from "../system/parts";
import "./diagnostics.css";

type Show = "all" | "problems";
type Status = DiagCheck["status"];

const GROUPS: { id: DiagCheck["group"]; title: string; help: string }[] = [
  { id: "setup", title: "Setup", help: "Configuration, Podman, PIN and clock." },
  { id: "modules", title: "Modules", help: "Is every installed module running and answering?" },
  { id: "storage", title: "Storage", help: "Data folders: drive mounted, writable, enough free space." },
  { id: "host", title: "Host", help: "Temperature, power supply, memory and the system disk." },
];

const TONE: Record<Status, StatusState> = { ok: "ok", info: "info", warn: "cau", fail: "crit" };
const LABEL: Record<Status, string> = { ok: "OK", info: "Info", warn: "Warning", fail: "Problem" };
const isProblem = (c: DiagCheck) => c.status === "warn" || c.status === "fail";

/** Diagnostics: runs core's checks and shows what is broken, with a fix for each. */
export function DiagnosticsScreen() {
  const run = useDiagnosticsRun({ query: { staleTime: 0, refetchOnWindowFocus: false, retry: false } });
  const [show, setShow] = useState<Show>("all");
  const data = run.data;
  const problems = data ? data.counts.fail + data.counts.warn : 0;

  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        checks: (data?.checks ?? []).filter((c) => c.group === g.id && (show === "all" || isProblem(c))),
      })).filter((g) => g.checks.length),
    [data, show],
  );

  const context = data
    ? `Checked ${new Date(data.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${(data.durationMs / 1000).toFixed(1)} s`
    : run.isFetching
      ? "Checking…"
      : undefined;

  const actions = (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => void run.refetch()}
        disabled={run.isFetching}
      >
        <Icon name="refresh" />
        <span className="diag-act-text">{run.isFetching ? "Checking…" : "Run again"}</span>
      </button>
      {data && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => download(data)}>
          <Icon name="download" />
          <span className="diag-act-text">Report</span>
        </button>
      )}
    </>
  );

  return (
    <Screen module="diagnostics" title="Diagnostics" context={context} actions={actions}>
      <div className="diag">
        {run.isError && (
          <Banner tone="crit" title="The checks could not run">
            Core did not answer. Check that it is running (<code>./manage.sh status</code> on the Pi) and try again.
          </Banner>
        )}
        {!data && run.isFetching && <p className="help">Running the checks, this takes a few seconds…</p>}

        {data && <Verdict report={data} />}

        {data && (
          <div className="seg" role="group" aria-label="Which checks">
            <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>
              All · {data.checks.length}
            </button>
            <button type="button" aria-pressed={show === "problems"} onClick={() => setShow("problems")}>
              Problems · {problems}
            </button>
          </div>
        )}

        {data && show === "problems" && !problems && <p className="help">No problems found.</p>}

        {groups.map((g) => (
          <article className="card" key={g.id}>
            <div className="card-head">
              <h2 className="h2">{g.title}</h2>
              <GroupBadge checks={g.checks} />
            </div>
            <p className="help">{g.help}</p>
            <ul className="list diag-checks">
              {g.checks.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Screen>
  );
}

function Verdict({ report }: { report: DiagnosticsReport }) {
  const { fail, warn, info, ok } = report.counts;
  const tally = `${ok} OK · ${info} info · ${warn} warnings · ${fail} problems`;
  if (fail) {
    return (
      <Banner tone="crit" title={`${fail} ${fail === 1 ? "problem" : "problems"} found`}>
        Something does not work right now. Each problem below says what to do. {tally}.
      </Banner>
    );
  }
  if (warn) {
    return (
      <Banner tone="cau" title={`${warn} ${warn === 1 ? "warning" : "warnings"}`}>
        Everything runs, but this will cause trouble soon. {tally}.
      </Banner>
    );
  }
  return (
    <Banner tone="ok" title="Everything works">
      {tally}.
    </Banner>
  );
}

function GroupBadge({ checks }: { checks: DiagCheck[] }) {
  const fail = checks.filter((c) => c.status === "fail").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  if (fail) return <SmBadge tone="crit">{fail} failed</SmBadge>;
  if (warn) return <SmBadge tone="cau">{warn} warn</SmBadge>;
  return <SmBadge tone="ok">OK</SmBadge>;
}

function CheckRow({ check: c }: { check: DiagCheck }) {
  const problem = isProblem(c);
  return (
    <li className={`diag-check is-${c.status}`}>
      <div className="diag-check-head">
        <SmBadge tone={TONE[c.status]}>{LABEL[c.status]}</SmBadge>
        <span className="diag-title">{c.title}</span>
      </div>
      <span className={`diag-summary${problem ? " is-problem" : ""}`}>{c.summary}</span>
      {c.details.length > 0 && (
        <ul className="diag-details">
          {c.details.map((d, i) => (
            <li key={i} className="data">
              {d}
            </li>
          ))}
        </ul>
      )}
      {c.fix && (
        <p className="diag-fix">
          <span className="label">Fix</span> <Code text={c.fix} />
        </p>
      )}
    </li>
  );
}

/** Text with `commands` in backticks shown as code. */
function Code({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
    </>
  );
}

/** The report as plain text, to keep or send to whoever helps (works over plain HTTP, unlike the clipboard). */
function download(r: DiagnosticsReport) {
  const lines = [
    `outpost diagnostics${r.hostname ? ` · ${r.hostname}` : ""}${r.version ? ` · v${r.version}` : ""}`,
    `${r.checkedAt} · ${r.counts.ok} ok, ${r.counts.info} info, ${r.counts.warn} warn, ${r.counts.fail} fail`,
  ];
  for (const g of GROUPS) {
    const checks = r.checks.filter((c) => c.group === g.id);
    if (!checks.length) continue;
    lines.push("", `## ${g.title}`);
    for (const c of checks) {
      lines.push(`[${c.status.toUpperCase().padEnd(4)}] ${c.title}: ${c.summary}`);
      for (const d of c.details) lines.push(`         ${d}`);
      if (c.fix) lines.push(`         Fix: ${c.fix}`);
    }
  }
  const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `outpost-diagnostics-${r.checkedAt.slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
