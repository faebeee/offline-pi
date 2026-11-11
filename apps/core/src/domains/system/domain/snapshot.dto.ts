// The system domain's read model. Classes, not interfaces: the
// @nestjs/swagger CLI plugin (nest-cli.json) turns them into OpenAPI schemas,
// so the web app gets them through @outpost/api-client.
import { ConnectionsInfo, ContainersInfo } from '../../../platform/runtime/runtime.dto';

export class HostAddress {
  iface!: string;
  address!: string;
}

export class SystemInfo {
  hostname!: string;
  model!: string | null;
  os!: string | null;
  kernel!: string;
  arch!: string;
  uptimeSec!: number;
  processes!: number | null;
  addresses!: HostAddress[];
}

export class CpuInfo {
  /** percent, all cores */
  usage!: number | null;
  /** percent per core */
  cores!: number[];
  /** current frequency per core */
  freqMhz!: number[];
  maxFreqMhz!: number | null;
  /** 1, 5 and 15 minute load average */
  load!: number[];
}

export class Sensor {
  name!: string;
  celsius!: number;
}

export class TempsInfo {
  /** °C */
  cpu!: number | null;
  sensors!: Sensor[];
}

export class FanInfo {
  rpm!: number | null;
  pwmPercent!: number | null;
}

export class PowerRail {
  name!: string;
  volts!: number | null;
  amps!: number | null;
}

export class PowerInfo {
  /** Pi 5 PMIC EXT5V_V: the 5 V rail as delivered by the PSU */
  inputVolts!: number | null;
  coreVolts!: number | null;
  /** Sum of the PMIC rails (Pi 5 only); excludes USB peripherals */
  socWatts!: number | null;
  rails!: PowerRail[];
  /** Current the PSU negotiated via USB-PD (Pi 5 only) */
  psuMaxCurrentMa!: number | null;
  /** true = USB ports may draw 1.6 A, false = limited to 600 mA */
  usbHighCurrent!: boolean | null;
  usbOverCurrent!: boolean | null;
  /** live under-voltage alarm from the rpi_volt hwmon */
  underVoltageNow!: boolean | null;
}

export class ThrottleFlags {
  underVoltage!: boolean;
  freqCapped!: boolean;
  throttled!: boolean;
  softTempLimit!: boolean;
}

export class ThrottleState {
  raw!: string;
  now!: ThrottleFlags;
  sinceBoot!: ThrottleFlags;
}

export class MemoryInfo {
  total!: number;
  available!: number;
  used!: number;
  swapTotal!: number;
  swapUsed!: number;
}

export class DiskInfo {
  mount!: string;
  device!: string;
  fstype!: string;
  total!: number;
  used!: number;
  free!: number;
}

export class DiskIo {
  readBps!: number;
  writeBps!: number;
}

export class NetworkInfo {
  iface!: string;
  rxBps!: number;
  txBps!: number;
  rxTotal!: number;
  txTotal!: number;
}

export class WifiInfo {
  iface!: string;
  signalDbm!: number;
  quality!: number;
}

/** One full reading of the host, pushed to every dashboard client per tick. */
/** Outgoing internet access, checked by core about once a minute. */
export class InternetInfo {
  /** checking = no answer yet; disabled = CORE_INTERNET_CHECK_URLS is empty */
  state!: 'online' | 'offline' | 'checking' | 'disabled';
  /** when the last check finished (ms since epoch) */
  checkedAt!: number | null;
  /** round trip of the answering request, ms */
  latencyMs!: number | null;
  /** host that answered, e.g. build.protomaps.com */
  target!: string | null;
}

export class Snapshot {
  ts!: number;
  system!: SystemInfo;
  cpu!: CpuInfo;
  temps!: TempsInfo;
  fan!: FanInfo | null;
  power!: PowerInfo;
  throttle!: ThrottleState | null;
  memory!: MemoryInfo | null;
  disks!: DiskInfo[];
  diskIo!: DiskIo | null;
  network!: NetworkInfo[];
  wifi!: WifiInfo | null;
  vcgencmd!: boolean;
  containers!: ContainersInfo;
  connections!: ConnectionsInfo | null;
  internet!: InternetInfo;
}

/** Compact sample kept in the history ring buffers. */
export class HistoryPoint {
  t!: number;
  cpu!: number | null;
  temp!: number | null;
  volt!: number | null;
  mem!: number | null;
  rx!: number | null;
  tx!: number | null;
}

export class PowerEvent {
  t!: number;
  kind!: 'under-voltage' | 'throttled' | 'freq-capped' | 'soft-temp-limit';
  active!: boolean;
}

/** `GET /api/system/history` */
export class History {
  /** one point per minute, last 24 h */
  minutes!: HistoryPoint[];
  events!: PowerEvent[];
}

/** First message on the /system socket namespace. */
export class SystemInit extends History {
  intervalMs!: number;
  snapshot!: Snapshot | null;
  /** every sample of the last 15 minutes */
  live!: HistoryPoint[];
}

/** `GET /api/system/status` */
export class Liveness {
  ok!: boolean;
  ts!: number;
}
