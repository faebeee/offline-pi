import { Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, HttpException, HttpStatus, Ip, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { AuthService, parseCookies } from '../../../platform/auth/auth.service';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import { DUMMY_HASH, verifyPassword } from '../../../platform/auth/password';
import { SESSION_COOKIE, SESSION_DAYS } from '../../../platform/auth/sessions.store';
import { assertCsrf } from '../../../platform/http/control-guard';
import { Account, AuthState, ChangePasswordRequest, LoginRequest, SetupRequest } from '../domain/users.dto';

/** After this many wrong passwords from one address, it has to wait. */
const FREE_TRIES = 5;
const LOCK_S = 30;
const MAX_LOCK_S = 15 * 60;

export function toAccount(u: SessionUser & { createdAt?: number }): Account {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt ?? null };
}

/**
 * Logging in and out, and the first-run setup. Open without a login
 * (authMiddleware): state, setup, login, logout. Sessions are an httpOnly
 * cookie (SameSite=Strict, so no other site can use it).
 */
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(private readonly auth: AuthService) {}

  /** Whether the first-run setup is due, and who is logged in. */
  @Get('state')
  state(@Req() req: Request): AuthState {
    const user = this.auth.resolve(req.headers.cookie, undefined);
    const stored = user ? this.auth.users.byId(user.id) : undefined;
    return { setup: this.auth.users.needsSetup, user: user ? toAccount({ ...user, createdAt: stored?.createdAt }) : null };
  }

  /**
   * First run only: create the admin account and log in with it. Needs the
   * one-time setup code (CORE_DATA_DIR/setup.code, printed by install.sh and
   * start.sh); wrong codes count like wrong passwords.
   */
  @Post('setup')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async setup(
    @Body() body: SetupRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthState> {
    assertCsrf(piMonitor);
    if (!this.auth.users.needsSetup) throw new ConflictException('outpost is set up already: log in.');
    this.brake(ip);
    if (!this.auth.checkSetupCode(body.code)) {
      throw new ForbiddenException('Wrong setup code. It is shown at the end of ./install.sh and ./start.sh, or: ./manage.sh users setup-code');
    }
    const user = await this.auth.users.create(body.username, body.password, 'admin', true);
    this.failures.delete(ip);
    await this.auth.setupDone();
    await this.startSession(res, user.id);
    return { setup: false, user: toAccount(user) };
  }

  /** Log in; sets the session cookie. */
  @Post('login')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async login(
    @Body() body: LoginRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthState> {
    assertCsrf(piMonitor);
    this.brake(ip);
    const user = this.auth.users.byName(body.username);
    const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Wrong user name or password.');
    this.failures.delete(ip);
    await this.startSession(res, user.id);
    return { setup: false, user: toAccount(user) };
  }

  /** Log out: ends this session. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.sessions.revoke(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** Change your own password; your other sessions end. */
  @Post('password')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  async changePassword(
    @Body() body: ChangePasswordRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() current: SessionUser | undefined,
    @Req() req: Request,
  ): Promise<void> {
    assertCsrf(piMonitor);
    const user = current && !current.local ? this.auth.users.byId(current.id) : undefined;
    if (!user) throw new UnauthorizedException('Log in first.');
    if (!(await verifyPassword(body.current, user.passwordHash))) throw new UnauthorizedException('The current password is wrong.');
    await this.auth.users.setPassword(user.id, body.password);
    await this.auth.sessions.revokeUser(user.id, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  }

  /**
   * Counts an attempt (login or setup code) from IP before it is checked
   * (checking yields, so a burst of parallel tries is braked like tries one
   * after the other); a success clears it. 429 while the address must wait.
   */
  private brake(ip: string): void {
    const now = Date.now() / 1000;
    const f = this.failures.get(ip);
    if (f && f.until > now) {
      throw new HttpException(`Too many wrong attempts. Try again in ${Math.ceil(f.until - now)} seconds.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const count = (f?.count ?? 0) + 1;
    const lock = count >= FREE_TRIES ? Math.min(MAX_LOCK_S, LOCK_S * 2 ** (count - FREE_TRIES)) : 0;
    if (this.failures.size >= 10_000 && !f) this.failures.delete(this.failures.keys().next().value!);
    this.failures.set(ip, { count, until: now + lock });
  }

  private async startSession(res: Response, userId: string): Promise<void> {
    const token = await this.auth.sessions.create(userId);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_DAYS * 86400_000,
    });
  }
}
