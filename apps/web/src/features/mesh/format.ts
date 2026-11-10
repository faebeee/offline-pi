import type { MeshNode, RadioChannel, RadioStatus } from "@outpost/api-client";
import { utcDate, utcTime } from "@outpost/ui/outpost.js";

/** Meshtastic's broadcast address (channel messages). */
export const BROADCAST = 0xffffffff;

/** Messages per page of history. */
export const PAGE = 100;

/** Valid conversation keys: "ch:<0-7>" or "dm:<node num>" (core's pattern). */
export const CONV_RE = /^(ch:[0-7]|dm:\d+)$/;

export const hex = (num: number) => "!" + (num >>> 0).toString(16).padStart(8, "0");

export const hopsText = (h: number | null | undefined) =>
  h == null ? null : h === 0 ? "DIRECT" : `${h} HOP${h > 1 ? "S" : ""}`;

export const batteryText = (b: number | null | undefined) => (b == null ? null : b > 100 ? "EXT POWER" : `${b}%`);

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export function parseConv(conv: string): { kind: "ch" | "dm"; num: number } {
  const [kind, value] = conv.split(":");
  return { kind: kind === "ch" ? "ch" : "dm", num: Number(value) };
}

/** Great-circle distance in metres, null without both positions. */
export function distanceM(a: MeshNode | undefined, b: MeshNode | undefined): number | null {
  if (a?.latitude == null || b?.latitude == null || a.longitude == null || b.longitude == null) return null;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Day divider above the first message of a UTC day. */
export function dividerLabel(ts: number): string {
  const day = utcDate(ts * 1000);
  const today = utcDate(Date.now());
  const yesterday = utcDate(Date.now() - 86400000);
  const name = day === today ? "TODAY" : day === yesterday ? "YESTERDAY" : day;
  return `${name} · ${utcTime(ts * 1000)}`;
}

/** Names of nodes and conversations, from the status and node list. */
export interface Names {
  status: Partial<RadioStatus>;
  nodes: Map<number, MeshNode>;
  channel(index: number): RadioChannel | undefined;
  channelName(index: number): string;
  nodeName(num: number): string;
  nodeShort(num: number): string;
  convTitle(conv: string): string;
  isMe(num: number): boolean;
}

export function names(status: Partial<RadioStatus> | undefined, nodeList: MeshNode[] | undefined): Names {
  const s = status ?? {};
  const nodes = new Map((nodeList ?? []).map((n) => [n.num, n]));
  const channel = (index: number) => (s.channels ?? []).find((c) => c.index === index);
  const channelName = (index: number) => channel(index)?.name || `Channel ${index}`;
  const nodeName = (num: number) => {
    const n = nodes.get(num);
    return (n && (n.longName || n.shortName || n.nodeId)) || hex(num);
  };
  const nodeShort = (num: number) => nodes.get(num)?.shortName || hex(num).slice(-4);
  return {
    status: s,
    nodes,
    channel,
    channelName,
    nodeName,
    nodeShort,
    convTitle: (conv) => {
      const { kind, num } = parseConv(conv);
      return kind === "ch" ? `# ${channelName(num)}` : nodeName(num);
    },
    isMe: (num) => num === s.nodeNum,
  };
}
