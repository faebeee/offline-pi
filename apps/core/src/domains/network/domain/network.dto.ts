// The network domain's contract: the devices on the Pi's Wi-Fi hotspot and
// the block list. The network container (Python) speaks snake_case;
// infrastructure/network.mappers.ts maps it onto these classes.
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The host helper (host/network-guard) that turns the block list into a firewall rule. */
export class BlockEnforcer {
  /** the helper has reported at least once (it is installed) */
  installed!: boolean;
  /** unix seconds of its last run */
  appliedAt!: number | null;
  /** its last run failed (e.g. nft missing) */
  error!: string | null;
  /** the block list changed and the helper has not applied it (yet) */
  pending!: boolean;
}

export class NetworkStatus {
  /** `iw` works (false: no Wi-Fi on this host, e.g. macOS) */
  iwAvailable!: boolean;
  /** the hotspot interface (NETWORK_IFACE, or the first in AP mode) */
  interface!: string | null;
  interfaceFound!: boolean;
  /** "ap" while the hotspot runs, "managed" while the Pi is a Wi-Fi client */
  mode!: string | null;
  ssid!: string | null;
  channel!: number | null;
  /** devices associated right now */
  connected!: number;
  blocked!: number;
  /** entries in the offline vendor database */
  vendorPrefixes!: number;
  /** the DHCP leases folder is mounted (IP and hostname) */
  leasesReadable!: boolean;
  enforcer!: BlockEnforcer;
}

/** Live radio facts of an associated device (iw station dump). */
export class StationInfo {
  signalDbm!: number | null;
  signalAvgDbm!: number | null;
  connectedSeconds!: number | null;
  /** ms since the last frame from the device */
  inactiveMs!: number | null;
  /** bytes received from the device */
  rxBytes!: number | null;
  /** bytes sent to the device */
  txBytes!: number | null;
  rxBitrate!: string | null;
  txBitrate!: string | null;
  authorized!: boolean | null;
}

export class HotspotClient {
  /** lower case, colon separated */
  mac!: string;
  ip!: string | null;
  /** the name the device sent with its DHCP request */
  hostname!: string | null;
  /** manufacturer from the IEEE registry; null if unknown or randomized */
  vendor!: string | null;
  /** a private (locally administered) address: phones use one per network */
  randomized!: boolean;
  /** associated with the hotspot right now */
  connected!: boolean;
  blocked!: boolean;
  /** the block is in the firewall (the host helper applied it) */
  enforced!: boolean;
  note!: string | null;
  /** unix seconds */
  blockedAt!: number | null;
  /** unix seconds */
  firstSeen!: number | null;
  /** unix seconds */
  lastSeen!: number | null;
  /** unix seconds; null for no live lease */
  leaseExpires!: number | null;
  /** the browser that asked is this device (same IP) */
  you!: boolean;
  /** only while connected */
  station!: StationInfo | null;
}

export class BlockRequest {
  /** why it is blocked, shown in the list */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string;
}
