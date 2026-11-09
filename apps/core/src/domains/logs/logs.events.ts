import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import { Socket } from 'socket.io';
import { registerEventModels } from '../../platform/openapi/openapi';
import { socketOptions } from '../../platform/realtime/socket-options';
import { LogsService } from './application/logs.service';
import { LogBatch, LogFollowError } from './domain/logs.dto';

registerEventModels(LogBatch, LogFollowError);

/**
 * Socket.IO namespace /logs. The browser sends `follow` / `unfollow` with a
 * source id ("core" or a module id); core sends `entries` (LogBatch) with
 * every new batch of lines, and `followError` (LogFollowError) when the
 * source's stream fails or ends (e.g. the container stopped). One podman
 * stream per source, shared by every browser following it.
 */
@WebSocketGateway(socketOptions('/logs'))
export class LogsEvents implements OnGatewayDisconnect {
  /** socket id -> source id -> its subscription */
  private readonly follows = new Map<string, Map<string, Subscription>>();

  constructor(private readonly logs: LogsService) {}

  @SubscribeMessage('follow')
  follow(@ConnectedSocket() client: Socket, @MessageBody() source: string) {
    if (typeof source !== 'string' || !source) return;
    const mine = this.follows.get(client.id) ?? new Map<string, Subscription>();
    this.follows.set(client.id, mine);
    if (mine.has(source)) return;
    const fail = (message: string) => {
      mine.delete(source);
      const payload: LogFollowError = { source, message };
      client.emit('followError', payload);
    };
    try {
      const sub = this.logs.live(source).subscribe({
        next: (entries) => {
          const batch: LogBatch = { source, entries };
          client.emit('entries', batch);
        },
        error: (err: Error) => fail(err.message),
        complete: () => fail('The log stream ended (the container stopped).'),
      });
      if (!sub.closed) mine.set(source, sub);
    } catch (err) {
      fail((err as Error).message);
    }
  }

  @SubscribeMessage('unfollow')
  unfollow(@ConnectedSocket() client: Socket, @MessageBody() source: string) {
    const mine = this.follows.get(client.id);
    mine?.get(source)?.unsubscribe();
    mine?.delete(source);
  }

  handleDisconnect(client: Socket) {
    for (const sub of this.follows.get(client.id)?.values() ?? []) sub.unsubscribe();
    this.follows.delete(client.id);
  }
}
