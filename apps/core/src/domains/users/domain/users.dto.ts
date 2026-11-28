// The users domain's contract: accounts, logins and roles. The accounts
// themselves live in the shared kernel (platform/auth), since every request
// is checked against them.
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const NAME = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const NAME_MSG = 'A user name is 1 to 32 letters, digits, dots, dashes or underscores.';

export class Account {
  id!: string;
  username!: string;
  /** admin: also the control actions (modules, devices, deleting shared data) and the accounts */
  role!: 'admin' | 'user';
  /** unix seconds; null for the scripts' local access */
  createdAt!: number | null;
}

export class AuthState {
  /** no account exists yet: the web app asks for the admin account (and the setup code) */
  setup!: boolean;
  /** the logged-in account, null when logged out */
  user!: Account | null;
}

export class LoginRequest {
  @Transform(lower)
  @IsString()
  @MaxLength(32)
  username!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

/** The first admin account (first run only). */
export class SetupRequest {
  /** the one-time setup code: CORE_DATA_DIR/setup.code, printed by install.sh / start.sh */
  @IsString()
  @MaxLength(20)
  code!: string;

  @Transform(lower)
  @IsString()
  @Matches(NAME, { message: NAME_MSG })
  username!: string;

  /** at least 8 characters */
  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters.' })
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordRequest {
  @IsString()
  @MaxLength(200)
  current!: string;

  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters.' })
  @MaxLength(200)
  password!: string;
}

export class CreateUserRequest {
  @Transform(lower)
  @IsString()
  @Matches(NAME, { message: NAME_MSG })
  username!: string;

  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters.' })
  @MaxLength(200)
  password!: string;

  @IsIn(['admin', 'user'])
  role!: 'admin' | 'user';
}

/** Only the fields given change; a new password logs the account out everywhere. */
export class UpdateUserRequest {
  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters.' })
  @MaxLength(200)
  password?: string;
}
