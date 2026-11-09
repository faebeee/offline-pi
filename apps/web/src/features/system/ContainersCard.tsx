import type { ContainerInfo, ContainersInfo, ModuleStatus } from "@offline-pi/api-client";
import type { StatusState } from "@offline-pi/ui/outpost.js";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useControlModule, useModules } from "../modules/useModules";
import { fmtBytes, fmtNum, fmtUptime } from "./format";
import { Notice, SmBadge } from "./parts";

const STATE_TONE: Record<string, StatusState> = {
  running: "ok",
  paused: "cau",
  stopping: "cau",
  exited: "crit",
  stopped: "crit",
};

/** A module's container: `offline-pi-<id>` (compose service = module id). */
const moduleFor = (mods: ModuleStatus[], c: ContainerInfo) =>
  mods.find((m) => c.name === `offline-pi-${m.id}`) ?? mods.find((m) => c.service === m.id && c.app === "offline-pi");

/**
 * "Apps and containers": every container on the host. Rows of optional
 * modules get START / STOP (through useControlModule, PIN included);
 * STOP needs a second click within 4 s.
 */
export function ContainersCard({ info }: { info: ContainersInfo }) {
  const { data } = useModules();
  const control = useControlModule();
  const [armed, setArmed] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ label: string; action: string; message: string } | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(armTimer.current), []);

  const mods = (data?.modules ?? []).filter((m) => m.optional && m.installed);
  const ctl = !!data?.control && mods.length > 0;
  const pendingId = control.isPending ? control.variables?.id : undefined;

  const run = (m: ModuleStatus, action: "start" | "stop") => {
    clearTimeout(armTimer.current);
    setArmed(null);
    setFailed(null);
    control.mutate(
      { id: m.id, action },
      { onError: (err) => setFailed({ label: m.label, action, message: err.message }) },
    );
  };
  const arm = (id: string) => {
    clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = setTimeout(() => setArmed(null), 4000);
  };

  function controlButton(c: ContainerInfo) {
    if (c.self) return <span className="fg3 body-sm">This app</span>;
    const m = moduleFor(mods, c);
    if (!m) return null;
    if (m.missing.length) return <span className="fg3 body-sm">Run ./install.sh</span>;
    const pending = m.id === pendingId ? control.variables?.action : (m.busy ?? undefined);
    if (pending) {
      return (
        <button type="button" className="btn btn-sm btn-ghost" disabled>
          {pending === "stop" ? "Stopping" : "Starting"}…
        </button>
      );
    }
    if (c.state === "running" || c.state === "paused") {
      if (armed === m.id) {
        return (
          <button
            type="button"
            className="btn btn-sm btn-crit"
            autoFocus
            aria-label={`Confirm stop ${m.label}`}
            onClick={() => run(m, "stop")}
          >
            Confirm stop
          </button>
        );
      }
      return (
        <button type="button" className="btn btn-sm btn-ghost" aria-label={`Stop ${m.label}`} onClick={() => arm(m.id)}>
          Stop
        </button>
      );
    }
    if (c.state === "stopping") return null;
    return (
      <button type="button" className="btn btn-sm" aria-label={`Start ${m.label}`} onClick={() => run(m, "start")}>
        Start
      </button>
    );
  }

  const running = info.list.filter((c) => c.state === "running").length;
  const unhealthy = info.list.filter((c) => c.health === "unhealthy").length;
  const summary = info.available
    ? `${running} running` +
      (info.list.length > running ? ` · ${info.list.length - running} stopped` : "") +
      (unhealthy ? ` · ${unhealthy} unhealthy` : "")
    : "";
  const cols = ctl ? 8 : 7;
  const host = location.hostname;

  return (
    <article className="card wide">
      <div className="card-head">
        <h2 className="h2">Apps and containers</h2>
        <span className="label">{summary}</span>
      </div>
      {!info.available && (
        <Notice tone="info" title="No container data" body={info.error || "Container information unavailable."} />
      )}
      {failed && (
        <div role="alert" className="ctl-error">
          <Notice tone="crit" title={`Could not ${failed.action} ${failed.label}`} body={failed.message} />
        </div>
      )}
      <div className="table-wrap">
        <table className="table containers-table">
          <thead>
            <tr>
              <th>App / container</th>
              <th>State</th>
              <th>Ports</th>
              <th>Uptime</th>
              <th className="num">CPU</th>
              <th className="num">Memory</th>
              <th>Image</th>
              {ctl && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {info.available && !info.list.length && (
              <tr>
                <td colSpan={cols} className="fg3">
                  No containers.
                </td>
              </tr>
            )}
            {info.available &&
              info.list.map((c) => {
                const mod = moduleFor(mods, c);
                const group = mod?.label || c.service || c.app;
                let stateText = c.state;
                if (c.state !== "running" && c.exitCode != null) stateText += ` (${c.exitCode})`;
                const healthTone: StatusState = c.health === "healthy" ? "ok" : c.health === "unhealthy" ? "crit" : "cau";
                const tone: StatusState =
                  c.state === "running" && c.health === "unhealthy" ? "crit" : (STATE_TONE[c.state] ?? "off");
                const since = c.state === "running" ? c.startedAt : c.finishedAt;
                const age = since ? fmtUptime(Math.max(0, (Date.now() - since) / 1000)) : "--";
                return (
                  <tr key={c.id}>
                    <td>
                      {group ? (
                        <>
                          <b>{group}</b>
                          <span className="sub">{c.name}</span>
                        </>
                      ) : (
                        <b>{c.name}</b>
                      )}
                    </td>
                    <td>
                      <span className="badges">
                        <SmBadge tone={tone}>{stateText}</SmBadge>
                        {c.health && <SmBadge tone={healthTone}>{c.health}</SmBadge>}
                      </span>
                    </td>
                    <td>
                      <Ports c={c} mod={mod} host={host} />
                    </td>
                    <td>{c.state === "running" ? age : <span className="fg3">{age} ago</span>}</td>
                    <td className="num">{c.cpuPercent == null ? "--" : `${fmtNum(c.cpuPercent, 1)}%`}</td>
                    <td className="num">{c.memoryBytes == null ? "--" : fmtBytes(c.memoryBytes)}</td>
                    <td className="fg2">{(c.image || "--").replace(/^localhost\//, "")}</td>
                    {ctl && <td className="ctl">{controlButton(c)}</td>}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/** Modules are reached under their path in this app; their own port is loopback only. */
function Ports({ c, mod, host }: { c: ContainerInfo; mod: ModuleStatus | undefined; host: string }) {
  if (mod) {
    return (
      <>
        {c.state === "running" ? <Link to={mod.path}>{mod.path}</Link> : mod.path}
        {c.ports.length > 0 && <span className="fg3"> ({c.ports.map((p) => p.hostPort).join(", ")}, local)</span>}
      </>
    );
  }
  if (!c.ports.length) return c.hostNetwork ? <span className="fg3">host network</span> : <>--</>;
  return (
    <>
      {c.ports.map((p, i) => (
        <span key={`${p.hostPort}/${p.protocol}`}>
          {i > 0 && ", "}
          {p.protocol === "tcp" && c.state === "running" ? (
            <>
              <a href={`http://${host}:${p.hostPort}/`} target="_blank" rel="noopener">
                {p.hostPort}
              </a>
              {p.containerPort !== p.hostPort && <span className="fg3">→{p.containerPort}</span>}
            </>
          ) : (
            `${p.hostPort}/${p.protocol}`
          )}
        </span>
      ))}
      {c.hostNetwork && <span className="fg3"> (host)</span>}
    </>
  );
}
