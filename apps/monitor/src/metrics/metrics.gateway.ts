import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CollectorService } from './collector.service';
import { HistoryService } from './history.service';

/**
 * Socket.IO gateway on the HTTP port. New clients get `init` (latest
 * snapshot + history + power events); afterwards every sample is broadcast
 * as `snapshot`. The client library is served by socket.io itself at
 * /socket.io/socket.io.js, so the page needs no CDN.
 */
@WebSocketGateway({ serveClient: true })
export class MetricsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(MetricsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly collector: CollectorService,
    private readonly history: HistoryService,
  ) {}

  afterInit() {
    this.collector.snapshots$.subscribe((snap) => {
      if (this.server.engine.clientsCount > 0) this.server.emit('snapshot', snap);
    });
  }

  handleConnection(client: Socket) {
    this.logger.debug(`client connected: ${client.id}`);
    client.emit('init', {
      intervalMs: this.collector.intervalMs,
      snapshot: this.collector.latest,
      live: this.history.live,
      minutes: this.history.minutes,
      events: this.history.events,
    });
  }
}
