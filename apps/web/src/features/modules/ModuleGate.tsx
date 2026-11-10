import type { ReactNode } from "react";
import { Banner, Illustration } from "../../ui/outpost";
import { isRunning, useControlModule, useModules } from "./useModules";

/**
 * Renders a module's screen only while its container runs. Otherwise it
 * explains why (not installed, not configured, stopped) and offers START;
 * the screen appears as soon as the module is up.
 */
export function ModuleGate({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Gate
      id={id}
      fallback={(node, art) => (
        <div className="module-gate vstack">
          <Illustration name={art} className="gate-art" off={art !== "lost"} />
          {node}
        </div>
      )}
    >
      {children}
    </Gate>
  );
}

function Gate({
  id,
  children,
  fallback,
}: {
  id: string;
  children: ReactNode;
  /** what to show instead, with the scene to draw ("lost" when core is gone) */
  fallback: (node: ReactNode, art: string) => ReactNode;
}) {
  const { data, error } = useModules();
  const control = useControlModule();

  if (error && !data) {
    return fallback(
      <Banner tone="crit" title="Core is not reachable">
        {error.message}
      </Banner>,
      "lost",
    );
  }
  if (!data) return fallback(<p className="label">Loading…</p>, id);

  const m = data.modules.find((x) => x.id === id);
  if (isRunning(m)) return <>{children}</>;

  if (!m || !m.installed) {
    return fallback(
      <Banner tone="info" title={`${m?.label ?? id} is not installed`}>
        Add it by re-running ./install.sh on the Pi.
      </Banner>,
      id,
    );
  }
  if (m.missing.length) {
    return fallback(
      <Banner tone="cau" title={`${m.label} is not configured`}>
        It needs {m.missing.join(", ")}: run ./install.sh on the Pi.
      </Banner>,
      id,
    );
  }
  const starting = control.isPending || m.busy === "start" || (m.state === "running" && m.health === "starting");
  return fallback(
    <div className="vstack">
      <Banner
        tone="info"
        title={`${m.label} is not running`}
        action={
          data.control && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={starting}
              onClick={() => control.mutate({ id: m.id, action: "start" })}
            >
              {starting ? "Starting…" : `Start ${m.label}`}
            </button>
          )
        }
      >
        {data.control ? "Start it here; the page opens as soon as it is up." : data.controlError}
      </Banner>
      {control.error && (
        <Banner tone="crit" title={`Could not start ${m.label}`}>
          {control.error.message}
        </Banner>
      )}
    </div>,
    id,
  );
}
