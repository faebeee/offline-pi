import { createFileRoute } from "@tanstack/react-router";
import { SystemScreen } from "../features/system/SystemScreen";

/** System dashboard (core itself, always running: no ModuleGate). */
export const Route = createFileRoute("/system")({ component: SystemScreen });
