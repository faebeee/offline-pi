import { createFileRoute, Link } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { useStripLink } from "../app/strip";
import { describe } from "../features/modules/describe";
import { ModuleSwitches } from "../features/modules/ModuleSwitches";
import { useModules } from "../features/modules/useModules";
import { Badge, Icon } from "../ui/outpost";

export const Route = createFileRoute("/")({ component: Home });

/** Home (hub): every installed module as a tile, and the on/off switches. */
function Home() {
  const { data, isError } = useModules();
  useStripLink(isError ? "crit" : data ? "ok" : "cau", isError ? "CORE · OFFLINE" : data ? "CORE · LIVE" : "CORE · CONNECTING");

  const installed = (data?.modules ?? []).filter((m) => m.installed);
  return (
    <Screen module="home" title="offline-pi">
      <section aria-labelledby="hub-title">
        <h2 className="sr-only" id="hub-title">
          Modules
        </h2>
        <div className="hub">
          {installed.map((m) => {
            const d = describe(m);
            const off = m.optional && m.state !== "running";
            return (
              <Link key={m.id} to={m.path} className={`tile${off ? " is-off" : ""}`}>
                <div className="tile-head">
                  <Icon name={m.icon} />
                  <Badge state={d.tone} className="badge-sm">
                    {d.badge}
                  </Badge>
                </div>
                <div>
                  <div className="tile-name">{m.label}</div>
                  <div className="label">{m.description || d.line}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <ModuleSwitches />
    </Screen>
  );
}
