import { Injectable } from '@nestjs/common';
import { UpstreamClient, UpstreamService } from '../../../platform/upstream/upstream.service';
import type { HotspotClient, NetworkStatus } from '../domain/network.dto';
import { toClient, toStatus } from './network.mappers';

type Raw = Record<string, unknown>;

/** The network container's HTTP API (apps/network, FastAPI), on loopback. */
@Injectable()
export class NetworkClient {
  constructor(private readonly upstream: UpstreamService) {}

  get c(): UpstreamClient {
    return this.upstream.client('network');
  }

  async status(): Promise<NetworkStatus> {
    return toStatus(await this.c.get<Raw>('/api/status'));
  }

  async clients(clientIp?: string): Promise<HotspotClient[]> {
    return (await this.c.get<Raw[]>('/api/clients')).map((c) => toClient(c, clientIp));
  }

  async block(mac: string, note: string | undefined, clientIp?: string): Promise<HotspotClient> {
    return toClient(await this.c.post<Raw>('/api/blocked', { mac, note: note ?? null }), clientIp);
  }

  async unblock(mac: string, clientIp?: string): Promise<HotspotClient> {
    return toClient(await this.c.delete<Raw>(`/api/blocked/${encodeURIComponent(mac)}`), clientIp);
  }

  async forget(mac: string): Promise<void> {
    await this.c.delete<void>(`/api/clients/${encodeURIComponent(mac)}`);
  }
}
