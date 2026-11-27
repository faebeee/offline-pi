import { Link } from "@tanstack/react-router";
import { Icon } from "../ui/outpost";
import { useModules } from "../features/modules/useModules";

type Item = { id: string; label: string; icon: string; path: string; running: boolean };

const HOME: Item = { id: "home", label: "Home", icon: "hub", path: "/", running: true };

/**
 * Module nav: home and the installed apps first, then the screens of the
 * system itself (System, Logs, Info, Settings, Diagnostics: manifest
 * "nav": "system"), pushed to the end of the rail.
 */
export function Nav({ current }: { current: string }) {
  const { data } = useModules();
  const installed = (data?.modules ?? []).filter((m) => m.installed);
  const apps: Item[] = [
    HOME,
    ...installed
      .filter((m) => m.nav === "apps")
      .map((m) => ({ id: m.id, label: m.label, icon: m.icon, path: m.path, running: !m.optional || m.state === "running" })),
  ];
  const system: Item[] = installed
    .filter((m) => m.nav === "system")
    .map((m) => ({ id: m.id, label: m.label, icon: m.icon, path: m.path, running: true }));

  const link = (m: Item, first = false) => (
    <Link
      key={m.id}
      to={m.path}
      className={`nav-item${m.running ? "" : " is-off"}${first ? " nav-split" : ""}`}
      aria-current={m.id === current ? "page" : undefined}
    >
      <Icon name={m.icon} />
      <span>{m.label}</span>
    </Link>
  );

  return (
    <nav className="nav" aria-label="Modules">
      {apps.map((m) => link(m))}
      {system.map((m, i) => link(m, i === 0))}
    </nav>
  );
}
