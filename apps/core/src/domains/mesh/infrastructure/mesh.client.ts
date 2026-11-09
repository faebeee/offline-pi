import { Injectable } from '@nestjs/common';
import { UpstreamClient, UpstreamService } from '../../../platform/upstream/upstream.service';
import type { Conversation, MeshMessage, MeshNode, RadioStatus } from '../domain/mesh.dto';
import { toConversation, toMessage, toNode, toStatus } from './mesh.mappers';

type Raw = Record<string, unknown>;

/** The mesh container's HTTP API (apps/mesh, FastAPI), on loopback. */
@Injectable()
export class MeshClient {
  constructor(private readonly upstream: UpstreamService) {}

  get c(): UpstreamClient {
    return this.upstream.client('mesh');
  }

  async status(): Promise<RadioStatus> {
    return toStatus(await this.c.get<Raw>('/api/status'));
  }

  async conversations(): Promise<Conversation[]> {
    return (await this.c.get<Raw[]>('/api/conversations')).map(toConversation);
  }

  async messages(conv: string, before?: number, limit?: number): Promise<MeshMessage[]> {
    return (await this.c.get<Raw[]>('/api/messages', { query: { conv, before, limit } })).map(toMessage);
  }

  async nodes(): Promise<MeshNode[]> {
    return (await this.c.get<Raw[]>('/api/nodes')).map(toNode);
  }

  /**
   * Send a text. The PIN is checked by the container; the browser's address
   * is forwarded so its rate limit stays per client, not per core.
   */
  async send(conv: string, text: string, pin: string | undefined, clientIp: string | undefined): Promise<MeshMessage> {
    const raw = await this.c.post<Raw>(
      '/api/messages',
      { conv, text },
      { headers: { 'x-send-pin': pin, 'x-forwarded-for': clientIp }, timeoutMs: 30_000 },
    );
    return toMessage(raw);
  }

  /** ws:// URL of the container's live feed. */
  liveUrl(): string {
    return this.c.wsUrl('/api/live');
  }
}
