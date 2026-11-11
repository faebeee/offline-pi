import { createFileRoute, Link } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { describe } from "../features/modules/describe";
import { ModuleSwitches } from "../features/modules/ModuleSwitches";
import { useModules } from "../features/modules/useModules";
import { Badge, Icon, Illustration } from "../ui/outpost";

export const Route = createFileRoute("/")({ component: Home });

/** Home (hub): every installed module as a tile, and the on/off switches. */
function Home() {
  const { data, isError } = useModules();

  const installed = (data?.modules ?? []).filter((m) => m.installed);
  const optional = installed.filter((m) => m.optional);
  const running = optional.filter((m) => m.state === "running").length;
  return (
    <Screen module="home" title="outpost">
      <section className="hero" aria-labelledby="hero-title">
        <Illustration name="hero" />
        <div className="hero-text">
          <h2 className="hero-title" id="hero-title">
            {isError ? "Signal lost" : data ? "Outpost online" : "Connecting"}
          </h2>
          <span className="label">
            {isError
              ? "Core does not answer"
              : data
                ? `${running} of ${optional.length} modules running · no internet needed`
                : "Reaching core"}
          </span>
        </div>
      </section>
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
                <Illustration name={m.id} className="tile-art" off={off} />
                <div className="tile-head">
                  <Icon name={m.icon} />
                  <Badge key={d.badge} state={d.tone} className={`badge-sm${d.tone === "cau" && /ing$/.test(d.badge) ? " is-busy" : ""}`}>
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
