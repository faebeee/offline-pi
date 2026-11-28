import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_DATA_DIR } from '../storage/json-file';
import { SESSION_COOKIE, SessionsStore } from './sessions.store';
import { type Role, UsersStore } from './users.store';

/** Who made a request. */
export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  /** the scripts on the Pi (manage.sh), through CORE_DATA_DIR/cli.token */
  local?: boolean;
}

/** The scripts' identity: an admin that is no account. */
const LOCAL_ADMIN: SessionUser = { id: 'local', username: 'local', role: 'admin', local: true };

/** The peer is this machine (loopback): the only place the scripts' token is accepted. */
export function isLocalPeer(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.replace(/^::ffff:/, '');
  return a === '::1' || /^127\./.test(a);
}

/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "k7q2 9mxd" -> "K7Q29MXD": what the user typed, without spaces and dashes. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** name=value pairs of a Cookie header. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // a malformed cookie is ignored
    }
  }
  return out;
}

/**
 * Who a request comes from: the session cookie of a logged-in browser, or
 * the local admin token the scripts send (Authorization: Bearer, read from
 * CORE_DATA_DIR/cli.token, which only the Pi's user can read), accepted
 * only on a connection from the Pi itself.
 *
 * Also the first-run setup code: while no account exists, creating the
 * admin needs a one-time code that only someone with access to the Pi can
 * read (CORE_DATA_DIR/setup.code, core's log; install.sh and start.sh print
 * it), so nobody else on the network can claim the admin account first.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  private cliToken: Buffer | null = null;
  private setupCode: string | null = null;
  private readonly setupFile = join(CORE_DATA_DIR, 'setup.code');

  constructor(
    readonly users: UsersStore,
    readonly sessions: SessionsStore,
  ) {}

  async onModuleInit(): Promise<void> {
    const file = join(CORE_DATA_DIR, 'cli.token');
    try {
      await mkdir(CORE_DATA_DIR, { recursive: true });
      let token = (await readFile(file, 'utf8').catch(() => '')).trim();
      if (token.length < 32) {
        token = randomBytes(32).toString('base64url');
        await writeFile(file, `${token}\n`, { mode: 0o600 });
      }
      await chmod(file, 0o600).catch(() => undefined);
      this.cliToken = Buffer.from(token);
    } catch (err) {
      this.logger.warn(`no local admin token for the scripts (${file}): ${(err as Error).message}`);
    }
    await this.users.ready();
    await this.prepareSetupCode();
  }

  /** While no account exists: the code the setup form needs (kept across restarts). */
  private async prepareSetupCode(): Promise<void> {
    if (!this.users.needsSetup) {
      await rm(this.setupFile, { force: true }).catch(() => undefined);
      return;
    }
    let code = normalizeCode(await readFile(this.setupFile, 'utf8').catch(() => ''));
    if (code.length !== 8) {
      code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      try {
        await writeFile(this.setupFile, `${code.slice(0, 4)}-${code.slice(4)}\n`, { mode: 0o600 });
      } catch (err) {
        this.logger.warn(`could not write ${this.setupFile}: ${(err as Error).message}`);
      }
    }
    this.setupCode = code;
    this.logger.log(`First run: create the admin account in the web app with the setup code ${code.slice(0, 4)}-${code.slice(4)}`);
  }

  /** Whether CODE is the first-run setup code (constant time). */
  checkSetupCode(code: string): boolean {
    if (!this.setupCode) return false;
    const given = Buffer.from(normalizeCode(code));
    const expected = Buffer.from(this.setupCode);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** The admin exists: the code is spent. */
  async setupDone(): Promise<void> {
    this.setupCode = null;
    await rm(this.setupFile, { force: true }).catch(() => undefined);
  }

  /**
   * The user behind a Cookie and Authorization header, or null. PEER is the
   * connection's remote address: the scripts' token counts only from the
   * Pi itself, so a copied token is useless from the network.
   */
  resolve(cookie: string | undefined, authorization: string | undefined, peer?: string): SessionUser | null {
    const bearer = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
    if (bearer && this.cliToken && isLocalPeer(peer)) {
      const given = Buffer.from(bearer);
      if (given.length === this.cliToken.length && timingSafeEqual(given, this.cliToken)) return LOCAL_ADMIN;
    }
    const userId = this.sessions.userOf(parseCookies(cookie)[SESSION_COOKIE]);
    const user = userId ? this.users.byId(userId) : undefined;
    return user ? { id: user.id, username: user.username, role: user.role } : null;
  }
}
