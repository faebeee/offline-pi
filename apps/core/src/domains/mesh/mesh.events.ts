import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { registerEventModels } from '../../platform/openapi/openapi';
import { socketOptions } from '../../platform/realtime/socket-options';
import { MeshFeed } from './application/mesh-feed.service';
import { MeshLink, MeshMessage, MeshNode, RadioStatus } from './domain/mesh.dto';

registerEventModels(MeshLink, RadioStatus, MeshMessage, MeshNode);

/**
 * Socket.IO namespace /mesh: the radio's live feed. Events: `link`
 * (MeshLink: core <-> mesh container), `status` (RadioStatus), `message`
 * (MeshMessage, new or changed, e.g. acked), `node` (MeshNode), `nodes`
 * (MeshNode[]).
 */
@WebSocketGateway(socketOptions('/mesh'))
export class MeshEvents implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  nsp!: Namespace;

  private readonly releases = new Map<string, () => void>();

  constructor(private readonly feed: MeshFeed) {}

  afterInit() {
    this.feed.events$.subscribe((ev) => this.nsp.emit(ev.type, ev.data));
  }

  handleConnection(client: Socket) {
    this.releases.set(client.id, this.feed.acquire());
    client.emit('link', { connected: this.feed.connected });
    if (this.feed.lastStatus) client.emit('status', this.feed.lastStatus);
  }

  handleDisconnect(client: Socket) {
    this.releases.get(client.id)?.();
    this.releases.delete(client.id);
  }
}
