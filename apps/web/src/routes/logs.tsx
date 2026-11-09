import { createFileRoute } from "@tanstack/react-router";
import { LogsScreen } from "../features/logs/LogsScreen";

type Search = { source?: string };

export const Route = createFileRoute("/logs")({
  // ?source=<module id>: whose lines to show (default: core)
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.source === "string" && search.source ? { source: search.source } : {},
  component: LogsRoute,
});

/** Logs (served by core, always on: no ModuleGate). */
function LogsRoute() {
  const { source } = Route.useSearch();
  return <LogsScreen source={source ?? "core"} />;
}
