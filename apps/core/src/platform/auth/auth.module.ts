import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionsStore } from './sessions.store';
import { UsersStore } from './users.store';

/** Accounts and logins, for every domain (shared kernel). */
@Global()
@Module({
  providers: [UsersStore, SessionsStore, AuthService],
  exports: [UsersStore, SessionsStore, AuthService],
})
export class AuthModule {}
