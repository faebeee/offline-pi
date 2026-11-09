import { OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { registerEventModels } from '../../platform/openapi/openapi';
import { socketOptions } from '../../platform/realtime/socket-options';
import { JobWatcher } from './application/job-watcher.service';
import { Job } from './domain/maps.dto';
import { MapsClient } from './infrastructure/maps.client';

registerEventModels(Job);

const room = (id: string) => `job:${id}`;

/**
 * Socket.IO namespace /maps. The browser sends `watchJob` / `unwatchJob`
 * with a job id; core sends `job` (Job) on every change until it settles.
 */
@WebSocketGateway(socketOptions('/maps'))
export class MapsEvents implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  nsp!: Namespace;

  constructor(
    private readonly jobs: JobWatcher,
    private readonly maps: MapsClient,
  ) {}

  afterInit() {
    this.jobs.updates$.subscribe((job) => this.nsp.to(room(job.id)).emit('job', job));
  }

  @SubscribeMessage('watchJob')
  async watchJob(@ConnectedSocket() client: Socket, @MessageBody() id: string) {
    if (typeof id !== 'string' || !id) return;
    await client.join(room(id));
    this.jobs.watch(id);
    // the stream only sends changes: start this browser off with the current state
    try {
      client.emit('job', await this.maps.job(id));
    } catch {
      // unknown job or module down: nothing to send
    }
  }

  @SubscribeMessage('unwatchJob')
  async unwatchJob(@ConnectedSocket() client: Socket, @MessageBody() id: string) {
    if (typeof id !== 'string') return;
    await client.leave(room(id));
    this.release(id);
  }

  handleDisconnect() {
    // rooms are left right after this hook: then drop unwatched streams
    setTimeout(() => this.releaseAll(), 0);
  }

  private release(id: string) {
    if (!this.nsp.adapter.rooms.get(room(id))?.size) this.jobs.unwatch(id);
  }

  private releaseAll() {
    for (const id of this.jobs.watched()) this.release(id);
  }
}
