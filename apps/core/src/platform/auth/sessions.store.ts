import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { JsonFile } from '../storage/json-file';

export const SESSION_COOKIE = 'outpost_session';
export const SESSION_DAYS = 30;

interface Session {
  /** sha256 of the token: the file never holds a usable token */
  id: string;
  userId: string;
  /** unix seconds */
  expires: number;
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const now = () => Math.floor(Date.now() / 1000);

/**
 * Logins: a random token in an httpOnly cookie, its hash in
 * CORE_DATA_DIR/sessions.json, so a restart of core logs nobody out. A
 * session lasts SESSION_DAYS; logging out, a new password or deleting the
 * account ends it.
 */
@Injectable()
export class SessionsStore implements OnModuleInit {
  private readonly file = JsonFile.inDataDir<{ sessions?: Session[] }>('sessions.json', () => ({}), 0o600);
  private sessions = new Map<string, Session>();

  async onModuleInit(): Promise<void> {
    const raw = await this.file.load();
    for (const s of raw.sessions ?? []) if (s.expires > now()) this.sessions.set(s.id, s);
  }

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(digest(token), { id: digest(token), userId, expires: now() + SESSION_DAYS * 86400 });
    await this.save();
    return token;
  }

  /** The user id of a valid token, else null. */
  userOf(token: string | undefined): string | null {
    if (!token) return null;
    const s = this.sessions.get(digest(token));
    if (!s) return null;
    if (s.expires <= now()) {
      this.sessions.delete(s.id);
      return null;
    }
    return s.userId;
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token && this.sessions.delete(digest(token))) await this.save();
  }

  /** End every session of a user, except KEEP (the one changing its password). */
  async revokeUser(userId: string, keep?: string): Promise<void> {
    const keepId = keep ? digest(keep) : null;
    let changed = false;
    for (const s of [...this.sessions.values()]) {
      if (s.userId === userId && s.id !== keepId) {
        this.sessions.delete(s.id);
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  private save(): Promise<void> {
    const t = now();
    return this.file.save({ sessions: [...this.sessions.values()].filter((s) => s.expires > t) });
  }
}
