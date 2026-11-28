import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JsonFile } from '../storage/json-file';
import { hashPassword } from './password';

export type Role = 'admin' | 'user';
export const ROLES: Role[] = ['admin', 'user'];

export interface StoredUser {
  id: string;
  /** lower case, [a-z0-9._-], 1-32 chars */
  username: string;
  role: Role;
  passwordHash: string;
  /** unix seconds */
  createdAt: number;
}

export const USERNAME = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export const MIN_PASSWORD = 8;

export function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD) throw new BadRequestException(`A password needs at least ${MIN_PASSWORD} characters.`);
  if (password.length > 200) throw new BadRequestException('That password is too long.');
}

/**
 * The accounts, in CORE_DATA_DIR/users.json (passwords as scrypt hashes).
 * No account yet means the first-run setup: the web app asks for the admin.
 */
@Injectable()
export class UsersStore implements OnModuleInit {
  private readonly logger = new Logger('Users');
  private readonly file = JsonFile.inDataDir<{ users?: StoredUser[] }>('users.json', () => ({}), 0o600);
  private users: StoredUser[] = [];
  private loading: Promise<void> | null = null;

  onModuleInit(): Promise<void> {
    return this.ready();
  }

  /** Resolves once users.json is read (others can await it in their own init). */
  ready(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    const raw = await this.file.load();
    this.users = Array.isArray(raw.users) ? raw.users.filter((u) => u && USERNAME.test(u.username) && ROLES.includes(u.role)) : [];
    this.logger.log(this.users.length ? `${this.users.length} accounts` : 'No accounts yet: the web app asks for the admin account');
  }

  /** No account exists: the web app shows the first-run setup. */
  get needsSetup(): boolean {
    return this.users.length === 0;
  }

  list(): StoredUser[] {
    return [...this.users].sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.username.localeCompare(b.username));
  }

  byId(id: string): StoredUser | undefined {
    return this.users.find((u) => u.id === id);
  }

  byName(username: string): StoredUser | undefined {
    const name = username.trim().toLowerCase();
    return this.users.find((u) => u.username === name);
  }

  /**
   * ONLY_FIRST: the first-run setup, refused once any account exists. Both
   * checks are made again after hashing (which yields), so two requests at
   * the same time can't both get through.
   */
  async create(username: string, password: string, role: Role, onlyFirst = false): Promise<StoredUser> {
    const name = username.trim().toLowerCase();
    if (!USERNAME.test(name)) throw new BadRequestException('A user name is 1 to 32 letters, digits, dots, dashes or underscores.');
    const check = () => {
      if (onlyFirst && !this.needsSetup) throw new ConflictException('outpost is set up already: log in.');
      if (this.byName(name)) throw new ConflictException(`"${name}" exists already.`);
    };
    check();
    checkPassword(password);
    const passwordHash = await hashPassword(password);
    check();
    const user: StoredUser = { id: randomUUID(), username: name, role, passwordHash, createdAt: Math.floor(Date.now() / 1000) };
    this.users.push(user);
    await this.save();
    this.logger.log(`account "${name}" created (${role})`);
    return user;
  }

  async setPassword(id: string, password: string): Promise<StoredUser> {
    const user = this.get(id);
    checkPassword(password);
    user.passwordHash = await hashPassword(password);
    await this.save();
    return user;
  }

  async setRole(id: string, role: Role): Promise<StoredUser> {
    const user = this.get(id);
    if (user.role === 'admin' && role !== 'admin' && this.admins() === 1) {
      throw new ConflictException('This is the last admin: make someone else an admin first.');
    }
    user.role = role;
    await this.save();
    return user;
  }

  async remove(id: string): Promise<void> {
    const user = this.get(id);
    if (user.role === 'admin' && this.admins() === 1) throw new ConflictException('The last admin cannot be deleted.');
    this.users = this.users.filter((u) => u.id !== id);
    await this.save();
    this.logger.log(`account "${user.username}" deleted`);
  }

  private admins(): number {
    return this.users.filter((u) => u.role === 'admin').length;
  }

  private get(id: string): StoredUser {
    const user = this.byId(id);
    if (!user) throw new NotFoundException('No such account.');
    return user;
  }

  private save(): Promise<void> {
    return this.file.save({ users: this.users });
  }
}
