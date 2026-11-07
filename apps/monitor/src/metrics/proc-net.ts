import { join } from 'node:path';
import { HOST_PROC, readText } from './host';

export interface RawSocket {
  family: 4 | 6;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  inode: number;
}

const TCP_STATES: Record<string, string> = {
  '01': 'ESTABLISHED',
  '02': 'SYN_SENT',
  '03': 'SYN_RECV',
  '04': 'FIN_WAIT1',
  '05': 'FIN_WAIT2',
  '06': 'TIME_WAIT',
  '07': 'CLOSE',
  '08': 'CLOSE_WAIT',
  '09': 'LAST_ACK',
  '0A': 'LISTEN',
  '0B': 'CLOSING',
};

/** TCP sockets of the host network namespace (we run with network_mode: host). */
export async function readTcpSockets(): Promise<RawSocket[]> {
  const out: RawSocket[] = [];
  for (const [file, family] of [['tcp', 4], ['tcp6', 6]] as const) {
    const text = await readText(join(HOST_PROC, 'net', file));
    if (!text) continue;
    for (const line of text.split('\n').slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10) continue;
      const [la, lp] = f[1].split(':');
      const [ra, rp] = f[2].split(':');
      out.push({
        family,
        localAddress: decodeAddress(la),
        localPort: parseInt(lp, 16),
        remoteAddress: decodeAddress(ra),
        remotePort: parseInt(rp, 16),
        state: TCP_STATES[f[3]] ?? f[3],
        inode: Number(f[9]),
      });
    }
  }
  return out;
}

/** /proc/net/tcp addresses are little-endian 32-bit words, in hex. */
function decodeAddress(hex: string): string {
  if (hex.length === 8) return word4(hex).join('.');
  const words = [0, 8, 16, 24].map((i) => hex.slice(i, i + 8));
  const bytes = words.flatMap(word4);
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) -> plain IPv4
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255) {
    return bytes.slice(12).join('.');
  }
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return compressV6(groups);
}

function word4(hex: string): number[] {
  const b = [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return b.reverse();
}

function compressV6(groups: string[]): string {
  // replace the longest run of zero groups with "::"
  let best = -1, bestLen = 0;
  for (let i = 0; i < groups.length; ) {
    if (groups[i] !== '0') { i++; continue; }
    let j = i;
    while (j < groups.length && groups[j] === '0') j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  if (bestLen < 2) return groups.join(':');
  return `${groups.slice(0, best).join(':')}::${groups.slice(best + bestLen).join(':')}`;
}

export function isLoopback(address: string): boolean {
  return address.startsWith('127.') || address === '::1';
}

/** Well-known ports, for sockets whose owner we can't read (root daemons). */
export const KNOWN_PORTS: Record<number, string> = {
  22: 'ssh',
  53: 'dns',
  80: 'http',
  443: 'https',
  631: 'cups',
  5353: 'mdns',
  3389: 'rdp',
  5900: 'vnc',
};
