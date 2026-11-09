import { Link } from "@tanstack/react-router";
import { Icon } from "../ui/outpost";
import { useModules } from "../features/modules/useModules";

const HOME = { id: "home", label: "Home", icon: "hub", path: "/", running: true };

/** Module nav: home plus every installed module (from core's /api/modules). */
export function Nav({ current }: { current: string }) {
  const { data } = useModules();
  const items = [
    HOME,
    ...(data?.modules ?? [])
      .filter((m) => m.installed)
      .map((m) => ({ id: m.id, label: m.label, icon: m.icon, path: m.path, running: !m.optional || m.state === "running" })),
  ];
  return (
    <nav className="nav" aria-label="Modules">
      {items.map((m) => (
        <Link
          key={m.id}
          to={m.path}
          className={`nav-item${m.running ? "" : " is-off"}`}
          aria-current={m.id === current ? "page" : undefined}
        >
          <Icon name={m.icon} />
          <span>{m.label}</span>
        </Link>
      ))}
    </nav>
  );
}
