import {
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

/** Start/stop a module (admins only; core answers 403 otherwise). */
export function useControlModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "stop" }) =>
      (await modulesControl(id, action)).module,
    onSettled: () => qc.invalidateQueries({ queryKey: getModulesListQueryKey() }),
  });
}
