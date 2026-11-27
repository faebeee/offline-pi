import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BoardPost, BoardStatus, CreatePostRequest, PostKind, UpdatePostRequest } from '../domain/board.dto';
import { POST_KINDS } from '../domain/board.dto';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'board.json');
export const MAX_POSTS = 5000;

type Stored = { nextId: number; posts: BoardPost[] };

const now = () => Math.floor(Date.now() / 1000);

/** pinned first, done last, newest change first */
const order = (a: BoardPost, b: BoardPost) =>
  Number(b.pinned) - Number(a.pinned) || Number(a.done) - Number(b.done) || b.updatedAt - a.updatedAt || b.id - a.id;

/**
 * The board's posts, kept by core in CORE_DATA_DIR/board.json (small: at
 * most MAX_POSTS short posts). Held in memory, every change written at once
 * to a temp file and renamed into place, one write at a time, so a power
 * cut leaves the old or the new file, never half of one.
 */
@Injectable()
export class BoardStore implements OnModuleInit {
  private readonly logger = new Logger('BoardStore');
  private data: Stored = { nextId: 1, posts: [] };
  private writing: Promise<void> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(FILE, 'utf8')) as Partial<Stored>;
      const posts = Array.isArray(raw.posts) ? raw.posts.filter((p) => POST_KINDS.includes(p?.kind)) : [];
      const nextId = Math.max(Number(raw.nextId) || 1, ...posts.map((p) => p.id + 1));
      this.data = { nextId, posts };
      this.logger.log(`Loaded ${posts.length} posts from ${FILE}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn(`ignoring unreadable ${FILE}: ${(err as Error).message}`);
    }
  }

  list(kind?: PostKind, includeDone = true): BoardPost[] {
    return this.data.posts.filter((p) => (!kind || p.kind === kind) && (includeDone || !p.done)).sort(order);
  }

  status(): BoardStatus {
    const kinds: BoardStatus['kinds'] = { notice: { open: 0, done: 0 }, need: { open: 0, done: 0 }, offer: { open: 0, done: 0 }, checkin: { open: 0, done: 0 } };
    let updatedAt: number | null = null;
    for (const p of this.data.posts) {
      kinds[p.kind][p.done ? 'done' : 'open'] += 1;
      updatedAt = Math.max(updatedAt ?? 0, p.updatedAt);
    }
    return { kinds, total: this.data.posts.length, updatedAt };
  }

  async create(body: CreatePostRequest): Promise<BoardPost> {
    if (this.data.posts.length >= MAX_POSTS) {
      throw new ConflictException(`The board is full (${MAX_POSTS} posts). Delete old ones first.`);
    }
    const t = now();
    const post: BoardPost = {
      id: this.data.nextId++,
      kind: body.kind,
      title: body.title,
      body: body.body ?? '',
      author: body.author || null,
      pinned: false,
      done: false,
      createdAt: t,
      updatedAt: t,
    };
    this.data.posts.push(post);
    await this.save();
    return post;
  }

  async update(id: number, body: UpdatePostRequest): Promise<BoardPost> {
    const post = this.find(id);
    if (body.kind !== undefined) post.kind = body.kind;
    if (body.title !== undefined) post.title = body.title;
    if (body.body !== undefined) post.body = body.body;
    if (body.author !== undefined) post.author = body.author || null;
    if (body.pinned !== undefined) post.pinned = body.pinned;
    if (body.done !== undefined) post.done = body.done;
    post.updatedAt = now();
    await this.save();
    return post;
  }

  async remove(id: number): Promise<void> {
    this.find(id);
    this.data.posts = this.data.posts.filter((p) => p.id !== id);
    await this.save();
  }

  private find(id: number): BoardPost {
    const post = this.data.posts.find((p) => p.id === id);
    if (!post) throw new NotFoundException(`Post ${id} does not exist.`);
    return post;
  }

  /** Writes are chained, so two changes never write the file at once. */
  private save(): Promise<void> {
    const text = JSON.stringify(this.data);
    const write = async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      await writeFile(tmp, text, 'utf8');
      await rename(tmp, FILE);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}
