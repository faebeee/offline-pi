// The mesh domain's contract (Meshtastic text messaging). The mesh
// container (Python) speaks snake_case; infrastructure/mesh.mappers.ts maps
// it onto these classes.
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RadioChannel {
  index!: number;
  name!: string;
  /** primary | secondary */
  role!: string;
}

export class RateLimit {
  count!: number;
  /** seconds */
  window!: number;
}

export class MeshConfig {
  /** sending needs the X-Send-PIN header (MESH_SEND_PIN) */
  sendPinRequired!: boolean;
  maxTextBytes!: number;
  rateLimit!: RateLimit;
}

export class RadioStatus {
  /** connecting | connected | disconnected | error ... */
  state!: string;
  error!: string | null;
  /** serial | tcp */
  connection!: string;
  device!: string | null;
  nodeNum?: number | null;
  nodeId?: string | null;
  longName?: string | null;
  shortName?: string | null;
  hwModel?: string | null;
  firmware?: string | null;
  region?: string | null;
  preset?: string | null;
  channels!: RadioChannel[];
  /** absent on live status updates */
  config?: MeshConfig;
}

export class Conversation {
  /** "ch:<index>" or "dm:<node num>" */
  conv!: string;
  count!: number;
  lastId!: number;
  /** unix seconds */
  lastTime!: number;
}

export class MeshMessage {
  id!: number;
  packetId!: number;
  conv!: string;
  /** unix seconds */
  rxTime!: number;
  fromNum!: number;
  toNum!: number;
  channel!: number;
  text!: string;
  direction!: 'in' | 'out';
  /** sent messages: pending | sent | acked | failed; received: null */
  status!: 'pending' | 'sent' | 'acked' | 'failed' | null;
  error!: string | null;
  rxSnr!: number | null;
  rxRssi!: number | null;
  hops!: number | null;
}

export class MeshNode {
  num!: number;
  nodeId!: string | null;
  longName!: string | null;
  shortName!: string | null;
  hwModel!: string | null;
  role!: string | null;
  /** unix seconds */
  lastHeard!: number | null;
  snr!: number | null;
  hopsAway!: number | null;
  /** percent (101 = powered) */
  battery!: number | null;
  voltage!: number | null;
  latitude!: number | null;
  longitude!: number | null;
  altitude!: number | null;
}

export class SendMessageRequest {
  /** "ch:<0-7>" or "dm:<node num>" */
  @IsString()
  @Matches(/^(ch:[0-7]|dm:\d+)$/)
  conv!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

/** /mesh socket: whether core is connected to the mesh container's live feed. */
export class MeshLink {
  connected!: boolean;
}
