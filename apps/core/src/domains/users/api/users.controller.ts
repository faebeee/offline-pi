import { Body, ConflictException, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import { SessionsStore } from '../../../platform/auth/sessions.store';
import { UsersStore } from '../../../platform/auth/users.store';
import { assertAdmin, assertControl } from '../../../platform/http/control-guard';
import { Account, CreateUserRequest, UpdateUserRequest } from '../domain/users.dto';
import { toAccount } from './auth.controller';

/** The accounts: admins only. */
@ApiTags('users')
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly users: UsersStore,
    private readonly sessions: SessionsStore,
  ) {}

  /** Every account, admins first. */
  @Get()
  list(@CurrentUser() user: SessionUser | undefined): Account[] {
    assertAdmin(user);
    return this.users.list().map(toAccount);
  }

  /** Add an account. */
  @Post()
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async create(
    @Body() body: CreateUserRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<Account> {
    assertControl(piMonitor, user);
    return toAccount(await this.users.create(body.username, body.password, body.role));
  }

  /** Change an account's role or set a new password (which logs it out everywhere). */
  @Patch(':id')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<Account> {
    assertControl(piMonitor, user);
    if (!this.users.byId(id)) throw new NotFoundException('No such account.');
    if (body.role) await this.users.setRole(id, body.role);
    if (body.password) {
      await this.users.setPassword(id, body.password);
      await this.sessions.revokeUser(id);
    }
    return toAccount(this.users.byId(id)!);
  }

  /** Delete an account (not your own, not the last admin); it is logged out. */
  @Delete(':id')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async remove(
    @Param('id') id: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<void> {
    assertControl(piMonitor, user);
    if (user?.id === id) throw new ConflictException("You can't delete your own account.");
    await this.users.remove(id);
    await this.sessions.revokeUser(id);
  }
}
