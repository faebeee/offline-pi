import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { request } from 'node:http';
import { join } from 'node:path';
import { HOST_ROOT, readText } from '../host/host';

export type ContainerAction = 'start' | 'stop';

/** Seconds podman waits after SIGTERM before it kills a container on stop. */
const STOP_TIMEOUT_SEC = 20;

/**
 * Starts and stops module containers through Podman's REST API (libpod). The
 * socket is the host user's podman.socket (PODMAN_SOCKET, a host path written
 * by install.sh), reached through the /hostfs mount: connecting to a unix
 * socket works on a read-only mount, so no extra bind mount is needed.
 */
@Injectable()
export class PodmanService implements OnModuleInit {
  /** resolves once selfId is known (RuntimeService waits for it) */
  readonly ready: Promise<void> = detectSelfId().then((id) => {
    this.selfId = id;
  });
  private readonly logger = new Logger(PodmanService.name);
  private readonly socket = process.env.PODMAN_SOCKET
    ? join(HOST_ROOT, process.env.PODMAN_SOCKET.replace(/^unix:\/\//, ''))
    : null;
  /** Full id of the container this dashboard runs in (never stopped from here). */
  selfId: string | null = null;

  onModuleInit() {
    if (!this.socket) this.logger.warn('PODMAN_SOCKET is empty: modules cannot be started; re-run ./install.sh');
  }

  /** Why control is unavailable, or null when it works. */
  get unavailableReason(): string | null {
    return this.socket ? null : 'PODMAN_SOCKET is not set: re-run ./install.sh.';
  }

  isSelf(fullId: string): boolean {
    return !!this.selfId && fullId === this.selfId;
  }

  /** Start or stop a container by name or id; resolves once podman is done. */
  async run(fullId: string, action: ContainerAction): Promise<void> {
    const query = action === 'stop' ? `?timeout=${STOP_TIMEOUT_SEC}` : '';
    const path = `/v4.0.0/libpod/containers/${encodeURIComponent(fullId)}/${action}${query}`;
    const { status, body } = await this.post(path, (STOP_TIMEOUT_SEC + 10) * 1000);
    // 204 done, 304 already in that state
    if (status === 204 || status === 304) return;
    let message = body.trim();
    try {
      message = JSON.parse(body).message ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message || `podman answered HTTP ${status}`);
  }

  private post(path: string, timeoutMs: number): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ socketPath: this.socket!, path, method: 'POST', timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('timeout', () => req.destroy(new Error('podman did not answer in time')));
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
          reject(new Error(`Podman socket not reachable (${err.code}). Is podman.socket running? Re-run ./install.sh.`));
        } else {
          reject(err);
        }
      });
      req.end();
    });
  }
}

/**
 * The container's own id: podman names its cgroup libpod-<id>.scope, and
 * /proc/self/cgroup shows it even with pid: host.
 */
async function detectSelfId(): Promise<string | null> {
  const cgroup = await readText('/proc/self/cgroup');
  const m = cgroup?.match(/libpod-(?:conmon-)?([0-9a-f]{64})/);
  if (m) return m[1];
  const env = await readText('/run/.containerenv');
  return env?.match(/^id="([0-9a-f]{64})"/m)?.[1] ?? null;
}
