import { Module } from '@nestjs/common';
import { AuthController } from './api/auth.controller';
import { UsersController } from './api/users.controller';

/** Domain "users": logging in, the first-run setup and the accounts (stores in platform/auth). */
@Module({ controllers: [AuthController, UsersController] })
export class UsersModule {}
