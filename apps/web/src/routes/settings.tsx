import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "../features/settings/SettingsScreen";

/** Settings (served by core, always on: no ModuleGate). */
export const Route = createFileRoute("/settings")({
  component: SettingsScreen,
});
