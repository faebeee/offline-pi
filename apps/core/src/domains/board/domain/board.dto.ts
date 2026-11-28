// The board domain's contract: posts on the Pi's notice board, kept by
// core itself (infrastructure/board.store.ts).
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const POST_KINDS = ['notice', 'need', 'offer', 'checkin'] as const;
export type PostKind = (typeof POST_KINDS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BoardPost {
  id!: number;
  /** notice: news for everyone; need: someone needs something; offer: someone can give or help; checkin: who is where and how */
  kind!: 'notice' | 'need' | 'offer' | 'checkin';
  title!: string;
  body!: string;
  /** who wrote it, as typed (there are no accounts) */
  author!: string | null;
  /** shown first */
  pinned!: boolean;
  /** a need met, an offer taken: kept, shown last */
  done!: boolean;
  /** unix seconds */
  createdAt!: number;
  /** unix seconds */
  updatedAt!: number;
}

export class KindCount {
  open!: number;
  done!: number;
}

export class BoardKinds {
  notice!: KindCount;
  need!: KindCount;
  offer!: KindCount;
  checkin!: KindCount;
}

export class BoardStatus {
  kinds!: BoardKinds;
  total!: number;
  /** unix seconds of the newest change, null when empty */
  updatedAt!: number | null;
}

export class CreatePostRequest {
  @IsIn(POST_KINDS)
  kind!: 'notice' | 'need' | 'offer' | 'checkin';

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  author?: string;
}

/** Only the fields given change. Pinning is for admins. */
export class UpdatePostRequest {
  @IsOptional()
  @IsIn(POST_KINDS)
  kind?: 'notice' | 'need' | 'offer' | 'checkin';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  author?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
