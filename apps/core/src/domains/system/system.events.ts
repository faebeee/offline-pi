import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { registerEventModels } from '../../platform/openapi/openapi';
import { socketOptions } from '../../platform/realtime/socket-options';
import { CollectorService } from './application/collector.service';
import { HistoryService } from './application/history.service';
import { UpdateService } from './application/update.service';
import { Snapshot, SystemInit } from './domain/snapshot.dto';
import { UpdateStatus } from './domain/update.dto';

registerEventModels(SystemInit, Snapshot, UpdateStatus);

/**
 * Socket.IO namespace /system. New clients get `init` (SystemInit: latest
 * snapshot, history, power events); then every sample is sent as `snapshot`,
 * and every new update check result as `update` (UpdateStatus).
 */
@WebSocketGateway(socketOptions('/system'))
export class SystemEvents implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(SystemEvents.name);

  @WebSocketServer()
  nsp!: Namespace;

  constructor(
    private readonly collector: CollectorService,
    private readonly history: HistoryService,
    private readonly updates: UpdateService,
  ) {}

  afterInit() {
    this.collector.snapshots$.subscribe((snap) => {
      if (this.nsp.sockets.size > 0) this.nsp.emit('snapshot', snap);
    });
    this.updates.updates$.subscribe((status) => {
      if (this.nsp.sockets.size > 0) this.nsp.emit('update', status);
    });
  }

  handleConnection(client: Socket) {
    this.logger.debug(`client connected: ${client.id}`);
    const init: SystemInit = {
      intervalMs: this.collector.intervalMs,
      snapshot: this.collector.latest,
      live: this.history.live,
      minutes: this.history.minutes,
      events: this.history.events,
    };
    client.emit('init', init);
  }
}
