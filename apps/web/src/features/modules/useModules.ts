import {
  ApiError,
  controlPin,
  getModulesListQueryKey,
  modulesControl,
  useModulesList,
  type ModuleStatus,
} from "@outpost/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Installed modules and their state, refreshed every few seconds. */
export function useModules() {
  return useModulesList({ query: { refetchInterval: 4000, staleTime: 2000 } });
}

export function useModule(id: string): ModuleStatus | undefined {
  return useModules().data?.modules.find((m) => m.id === id);
}

/** A module's container runs (core itself always does). */
export function isRunning(m: ModuleStatus | undefined): boolean {
  return !!m && m.installed && (!m.optional || m.state === "running");
}

/**
 * Runs a control action (start/stop, blocking a device). When core wants
 * the control PIN (CONTROL_PIN) it asks for it, keeps it for this tab and
 * tries again. WHAT completes "a PIN is needed to ...".
 */
export async function withControlPin<T>(what: string, action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await action();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && /PIN/.test(err.message)) {
        const had = controlPin.get();
        controlPin.set("");
        const entered = window.prompt(had ? "Wrong PIN. Control PIN:" : "Control PIN (CONTROL_PIN in .env):");
        if (!entered) throw new Error(`Cancelled: a PIN is needed to ${what}.`);
        controlPin.set(entered);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Wrong PIN.");
}

/** Start/stop a module (asks for the control PIN when needed). */
export function useControlModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "stop" }) =>
      (await withControlPin("start or stop modules", () => modulesControl(id, action))).module,
    onSettled: () => qc.invalidateQueries({ queryKey: getModulesListQueryKey() }),
  });
}
