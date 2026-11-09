/** One full reading of the host, pushed to every dashboard client per tick. */
export interface Snapshot {
  ts: number;
  system: {
    hostname: string;
    model: string | null;
    os: string | null;
    kernel: string;
    arch: string;
    uptimeSec: number;
    processes: number | null;
    addresses: { iface: string; address: string }[];
  };
  cpu: {
    usage: number | null; // percent, all cores
    cores: number[]; // percent per core
    freqMhz: number[]; // current frequency per core
    maxFreqMhz: number | null;
    load: [number, number, number];
  };
  temps: {
    cpu: number | null; // °C
    sensors: { name: string; celsius: number }[];
  };
  fan: { rpm: number | null; pwmPercent: number | null } | null;
  power: {
    /** Pi 5 PMIC EXT5V_V: the 5 V rail as delivered by the PSU */
    inputVolts: number | null;
    coreVolts: number | null;
    /** Sum of the PMIC rails (Pi 5 only); excludes USB peripherals */
    socWatts: number | null;
    rails: { name: string; volts: number | null; amps: number | null }[];
    /** Current the PSU negotiated via USB-PD (Pi 5 only) */
    psuMaxCurrentMa: number | null;
    /** true = USB ports may draw 1.6 A, false = limited to 600 mA */
    usbHighCurrent: boolean | null;
    usbOverCurrent: boolean | null;
    /** live under-voltage alarm from the rpi_volt hwmon */
    underVoltageNow: boolean | null;
  };
  throttle: ThrottleState | null;
  memory: {
    total: number;
    available: number;
    used: number;
    swapTotal: number;
    swapUsed: number;
  } | null;
  disks: {
    mount: string;
    device: string;
    fstype: string;
    total: number;
    used: number;
    free: number;
  }[];
  diskIo: { readBps: number; writeBps: number } | null;
  network: {
    iface: string;
    rxBps: number;
    txBps: number;
    rxTotal: number;
    txTotal: number;
  }[];
  wifi: { iface: string; signalDbm: number; quality: number } | null;
  vcgencmd: boolean;
  containers: ContainersInfo;
  connections: ConnectionsInfo | null;
}

export interface ThrottleFlags {
  underVoltage: boolean;
  freqCapped: boolean;
  throttled: boolean;
  softTempLimit: boolean;
}

export interface ThrottleState {
  raw: string;
  now: ThrottleFlags;
  sinceBoot: ThrottleFlags;
}

/** Compact sample kept in the history ring buffers. */
export interface HistoryPoint {
  t: number;
  cpu: number | null;
  temp: number | null;
  volt: number | null;
  mem: number | null;
  rx: number | null;
  tx: number | null;
}

export interface PowerEvent {
  t: number;
  kind: 'under-voltage' | 'throttled' | 'freq-capped' | 'soft-temp-limit';
  active: boolean;
}

export interface ContainerInfo {
  id: string;
  name: string;
  /** compose project, i.e. the offline-pi app directory */
  app: string | null;
  service: string | null;
  image: string | null;
  state: string;
  health: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  restartPolicy: string | null;
  hostNetwork: boolean;
  ports: { hostPort: number; containerPort: number; protocol: string }[];
  cpuPercent: number | null; // share of the whole machine
  memoryBytes: number | null;
  processes: number;
  /** the container this dashboard runs in (cannot be stopped from here) */
  self: boolean;
}

export interface ContainersInfo {
  available: boolean;
  error: string | null;
  /** start/stop from the dashboard is enabled and configured */
  control: boolean;
  list: ContainerInfo[];
}

export interface ConnectionsInfo {
  /** TCP sockets per state (ESTABLISHED, LISTEN, TIME_WAIT, ...) */
  counts: Record<string, number>;
  listening: {
    address: string;
    port: number;
    process: string | null;
    container: string | null;
    service: string | null;
    loopback: boolean;
  }[];
  established: {
    direction: 'in' | 'out';
    localAddress: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    process: string | null;
    container: string | null;
    service: string | null;
    loopback: boolean;
  }[];
  totalEstablished: number;
  /** distinct non-loopback peers */
  remoteHosts: number;
}
