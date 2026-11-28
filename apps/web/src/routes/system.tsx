import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "../app/AdminOnly";
import { SystemScreen } from "../features/system/SystemScreen";

/** System dashboard (core itself, always running: no ModuleGate). */
export const Route = createFileRoute("/system")({
  component: () => (
    <AdminOnly id="system">
      <SystemScreen />
    </AdminOnly>
  ),
});
