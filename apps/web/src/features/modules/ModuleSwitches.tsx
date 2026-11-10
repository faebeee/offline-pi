import { useState } from "react";
import { Badge, Banner } from "../../ui/outpost";
import { describe } from "./describe";
import { useControlModule, useModules } from "./useModules";

/** "Modules on this Pi": one on/off switch per optional module. */
export function ModuleSwitches() {
  const { data } = useModules();
  const control = useControlModule();
  const [failed, setFailed] = useState<{ label: string; action: string; message: string } | null>(null);
  if (!data) return null;

  const optional = data.modules.filter((m) => m.optional);
  const installed = optional.filter((m) => m.installed);
  const running = installed.filter((m) => m.state === "running").length;
  const pendingId = control.isPending ? control.variables?.id : undefined;

  return (
    <article className="card card-control">
      <div className="card-head">
        <h2 className="h2">Modules on this Pi</h2>
        <span className="label">
          {running} of {installed.length} running
        </span>
      </div>
      {failed && (
        <Banner tone="crit" title={`Could not ${failed.action} ${failed.label}`}>
          {failed.message}
        </Banner>
      )}
      <div className="vstack">
        {optional.map((m) => {
          const pending = m.id === pendingId ? control.variables?.action : undefined;
          const d = describe(m, pending);
          const busy = !!pending || !!m.busy;
          const can = data.control && m.installed && !m.missing.length && !busy;
          const why = !m.installed
            ? "Not installed: add it with ./install.sh"
            : m.missing.length
              ? `Not configured (${m.missing.join(", ")}): run ./install.sh`
              : !data.control
                ? data.controlError
                : d.line;
          const on = m.installed && m.enabled;
          return (
            <div className="switch-row" key={m.id}>
              <div className="row-main">
                <div className="row-title">
                  {m.label}{" "}
                  <Badge state={d.tone} className="badge-sm">
                    {d.badge}
                  </Badge>
                </div>
                <div className="row-meta body-sm fg2">{why}</div>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={on}
                aria-label={m.label}
                disabled={!can}
                onClick={() => {
                  const action = on ? "stop" : "start";
                  setFailed(null);
                  control.mutate(
                    { id: m.id, action },
                    { onError: (err) => setFailed({ label: m.label, action, message: err.message }) },
                  );
                }}
              />
            </div>
          );
        })}
      </div>
      <p className="body-sm fg2 help">
        Stopped modules stay stopped after a restart until you switch them on again. Add or remove modules with{" "}
        <span className="mono">./install.sh</span> on the Pi.
      </p>
    </article>
  );
}
