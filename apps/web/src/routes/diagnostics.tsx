import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "../app/AdminOnly";
import { DiagnosticsScreen } from "../features/diagnostics/DiagnosticsScreen";

/** Diagnostics (served by core, always on: no ModuleGate). */
export const Route = createFileRoute("/diagnostics")({
  component: () => (
    <AdminOnly id="diagnostics">
      <DiagnosticsScreen />
    </AdminOnly>
  ),
});
