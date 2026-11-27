// The supplies domain's contract: the household's emergency stock. The
// supplies container (Python) speaks snake_case; infrastructure/
// supplies.client.ts maps it onto these classes.
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export const CATEGORIES = ['water', 'food', 'medicine', 'hygiene', 'power', 'tools', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** "" clears an optional field */
const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : trim({ value }));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SupplyItem {
  id!: number;
  name!: string;
  category!: 'water' | 'food' | 'medicine' | 'hygiene' | 'power' | 'tools' | 'other';
  quantity!: number;
  /** free text, e.g. "L", "kg", "pcs"; L, dl, cl and ml count as water */
  unit!: string;
  /** below this the item is low */
  minimum!: number | null;
  /** YYYY-MM-DD */
  expires!: string | null;
  /** where it is kept, e.g. "Cellar shelf 2" */
  location!: string | null;
  note!: string | null;
  /** days until it expires (negative: expired), null without a date */
  daysLeft!: number | null;
  expired!: boolean;
  /** expires within the warning window (expiryWarningDays) */
  expiring!: boolean;
  /** quantity below its minimum */
  low!: boolean;
  /** unix seconds */
  updatedAt!: number;
}

export class SuppliesSettings {
  /** people the stock is for */
  people!: number;
  /** water per person and day, for drinking and cooking */
  waterLitresPerDay!: number;
  /** how many days the stock should last */
  targetDays!: number;
  /** items expiring within this many days are flagged */
  expiryWarningDays!: number;
}

export class CategoryCounts {
  water!: number;
  food!: number;
  medicine!: number;
  hygiene!: number;
  power!: number;
  tools!: number;
  other!: number;
}

export class SuppliesStatus {
  items!: number;
  expired!: number;
  expiring!: number;
  low!: number;
  /** litres of water that have not expired */
  waterLitres!: number;
  /** how long the water lasts for everyone at the daily amount */
  waterDays!: number | null;
  categories!: CategoryCounts;
  settings!: SuppliesSettings;
  /** unix seconds of the newest change, null when empty */
  updatedAt!: number | null;
}

export class CreateItemRequest {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: 'water' | 'food' | 'medicine' | 'hygiene' | 'power' | 'tools' | 'other';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1e9)
  quantity?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1e9)
  minimum?: number | null;

  /** YYYY-MM-DD; empty or null for none */
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE, { message: 'expires must be a date like 2027-03-31' })
  expires?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Only the fields given change; null clears minimum, expires, location and note. */
export class UpdateItemRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: 'water' | 'food' | 'medicine' | 'hygiene' | 'power' | 'tools' | 'other';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1e9)
  quantity?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(1e9)
  minimum?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE, { message: 'expires must be a date like 2027-03-31' })
  expires?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class AdjustItemRequest {
  /** added to the quantity (negative: used up); it never goes below 0 */
  @IsNumber()
  @Min(-1e9)
  @Max(1e9)
  delta!: number;
}

/** Only the fields given change. */
export class UpdateSettingsRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  people?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  waterLitresPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  targetDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  expiryWarningDays?: number;
}
