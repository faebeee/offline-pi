import { join } from 'node:path';
import { HOST_ROOT, readText } from '../../../platform/host/host';

/** The marker host/usb-storage writes above its fstab line (usb-storage.sh). */
const MARKER = '# outpost-usb-storage (host/usb-storage, do not edit this line)';

export interface UsbStorageEntry {
  /** e.g. UUID=6AF4-3E30 */
  source: string;
  mountPoint: string;
  fsType: string;
}

/** The drive host/usb-storage set up to mount automatically, if any. */
export async function usbStorageEntry(): Promise<UsbStorageEntry | null> {
  const lines = ((await readText(join(HOST_ROOT, 'etc/fstab'))) ?? '').split('\n');
  const at = lines.findIndex((l) => l.trim() === MARKER);
  if (at < 0) return null;
  const [source, mountPoint, fsType] = (lines[at + 1] ?? '').trim().split(/\s+/);
  return source && mountPoint ? { source, mountPoint, fsType: fsType ?? '' } : null;
}
