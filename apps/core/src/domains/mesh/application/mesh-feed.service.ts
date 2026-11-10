import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ModulesService } from '../../../platform/modules/modules.service';
import type { MeshMessage, MeshNode, RadioStatus } from '../domain/mesh.dto';
import { MeshClient } from '../infrastructure/mesh.client';
import { toMessage, toNode, toStatus } from '../infrastructure/mesh.mappers';

export type MeshEvent =
  | { type: 'status'; data: RadioStatus }
  | { type: 'message'; data: MeshMessage }
  | { type: 'node'; data: MeshNode }
  | { type: 'nodes'; data: MeshNode[] }
  | { type: 'link'; data: { connected: boolean } };

/**
 * One WebSocket from core to the mesh container's live feed (/api/live),
 * held while anyone listens (the /mesh namespace: the Mesh screen and the
 * node layer of Maps), reconnecting with backoff when the module restarts.
 * Events are mapped to the domain model and published on events$.
 */
@Injectable()
export class MeshFeed implements OnModuleDestroy {
  private readonly logger = new Logger(MeshFeed.name);
  readonly events$ = new Subject<MeshEvent>();
  private listeners = 0;
  private ws: WebSocket | null = null;
  private retry?: NodeJS.Timeout;
  private ping?: NodeJS.Timeout;
  private delay = 1000;
  connected = false;
  /** last status from the radio, sent to new listeners */
  lastStatus: RadioStatus | null = null;

  constructor(
    private readonly client: MeshClient,
    private readonly modules: ModulesService,
  ) {}

  /** Someone wants live events; returns the release function. */
  acquire(): () => void {
    this.listeners++;
    if (this.listeners === 1) this.open();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.listeners--;
      if (this.listeners === 0) this.close();
    };
  }

  onModuleDestroy() {
    this.listeners = 0;
    this.close();
  }

  private open() {
    clearTimeout(this.retry);
    if (this.ws || !this.listeners) return;
    if (!this.modules.isInstalled('mesh')) return;
    let url: string;
    try {
      url = this.client.liveUrl();
    } catch {
      return;
    }
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 1000;
      this.setConnected(true);
      // the container ignores what we send; it keeps proxies from idling out
      this.ping = setInterval(() => ws.readyState === ws.OPEN && ws.send('ping'), 25_000);
    };
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onerror = () => undefined; // onclose follows
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.ws === ws) this.ws = null;
      this.setConnected(false);
      if (this.listeners) {
        this.retry = setTimeout(() => this.open(), this.delay);
        this.delay = Math.min(this.delay * 2, 15_000);
      }
    };
  }

  private close() {
    clearTimeout(this.retry);
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setConnected(false);
  }

  private setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    if (!connected) this.lastStatus = null;
    this.events$.next({ type: 'link', data: { connected } });
  }

  private onMessage(text: string) {
    let msg: { type?: string; data?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const data = msg.data as Record<string, unknown>;
    switch (msg.type) {
      case 'status': {
        const status = toStatus(data);
        // live updates carry no config: keep the one from the first status
        if (!status.config && this.lastStatus?.config) status.config = this.lastStatus.config;
        this.lastStatus = status;
        this.events$.next({ type: 'status', data: status });
        break;
      }
      case 'message':
        this.events$.next({ type: 'message', data: toMessage(data) });
        break;
      case 'node':
        this.events$.next({ type: 'node', data: toNode(data) });
        break;
      case 'nodes':
        this.events$.next({ type: 'nodes', data: (msg.data as Record<string, unknown>[]).map(toNode) });
        break;
      default:
        this.logger.debug(`unknown mesh event ${msg.type}`);
    }
  }
}
