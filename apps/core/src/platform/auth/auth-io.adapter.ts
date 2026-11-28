import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Namespace, Server, ServerOptions } from 'socket.io';
import { AuthService } from './auth.service';

/**
 * Socket.IO behind the login: every namespace (/system, /maps, /logs)
 * refuses a connection without a valid session cookie, and the namespace of
 * an admin-only module (/<id> for "admin": true: /system, /logs) one that
 * is not an admin's.
 */
export class AuthIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly auth: AuthService,
    private readonly adminIds: () => readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.on('new_namespace', (nsp: Namespace) => {
      nsp.use((socket, next) => {
        const h = socket.handshake.headers;
        const user = this.auth.resolve(h.cookie, h.authorization, socket.conn.remoteAddress);
        if (!user) return next(new Error('Log in first.'));
        if (user.role !== 'admin' && this.adminIds().includes(nsp.name.replace(/^\//, ''))) {
          return next(new Error('Only an admin can open this.'));
        }
        next();
      });
    });
    return server;
  }
}
