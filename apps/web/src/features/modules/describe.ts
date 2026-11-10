import type { ModuleStatus } from "@outpost/api-client";
import type { StatusState } from "@outpost/ui/outpost.js";

/** State badge + one status line for a module. */
export function describe(m: ModuleStatus, pending?: "start" | "stop"): { tone: StatusState; badge: string; line: string } {
  if (!m.optional) return { tone: "ok", badge: "Running", line: "Always on" };
  if (!m.installed) return { tone: "off", badge: "Not installed", line: "Add with ./install.sh" };
  const busy = pending ?? m.busy;
  if (busy) return { tone: "cau", badge: busy === "start" ? "Starting" : "Stopping", line: "" };
  if (m.missing.length) return { tone: "cau", badge: "Not configured", line: "Run ./install.sh" };
  if (m.state === "missing") return { tone: "crit", badge: "No container", line: "Run ./start.sh" };
  if (m.state === "running") {
    if (m.health === "unhealthy") return { tone: "crit", badge: "Unhealthy", line: "Running" };
    if (m.health === "starting") return { tone: "cau", badge: "Starting", line: "Running" };
    return { tone: "ok", badge: "Running", line: m.enabled ? "On" : "On (switched off)" };
  }
  if (m.enabled) return { tone: "crit", badge: "Stopped", line: m.error || "Switched on but not running" };
  return { tone: "off", badge: "Off", line: "Switched off" };
}
