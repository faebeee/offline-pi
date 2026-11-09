/** One module as the home page and the nav see it (`GET /api/modules`). */
export class ModuleStatus {
  id!: string;
  num!: number;
  label!: string;
  icon!: string;
  description!: string;
  /** web route of the module (e.g. /maps/); also its passthrough under /svc */
  path!: string;
  optional!: boolean;
  /** podman container name, offline-pi-<service> */
  container!: string;
  installed!: boolean;
  /** switched on (persisted); modules not installed are never enabled */
  enabled!: boolean;
  /** a start/stop is in flight */
  busy!: 'start' | 'stop' | null;
  /** requires[] entries that are still unset */
  missing!: string[];
  /** 'missing' = no container, otherwise the container's state (running, exited, created, ...) */
  state!: string;
  health!: string | null;
  /** last start/stop failure, cleared on the next attempt */
  error!: string | null;
}

export class ModulesOverview {
  /** core can reach podman.socket and start/stop modules */
  control!: boolean;
  controlError!: string | null;
  /** start/stop needs the X-Control-Pin header (CONTROL_PIN is set) */
  pinRequired!: boolean;
  modules!: ModuleStatus[];
}

export class ModuleActionResult {
  module!: ModuleStatus;
}
