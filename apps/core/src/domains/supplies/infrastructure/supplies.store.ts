import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { JsonFile } from '../../../platform/storage/json-file';
import {
  CATEGORIES,
  type Category,
  type CategoryCounts,
  type CreateItemRequest,
  type SuppliesSettings,
  type SuppliesStatus,
  type SupplyItem,
  type UpdateItemRequest,
  type UpdateSettingsRequest,
} from '../domain/supplies.dto';

export const MAX_ITEMS = 5000;

/**
 * Defaults after the Swiss emergency stockpile advice (BABS "Notvorrat"):
 * water for about a week, 3 L per person and day for drinking and cooking.
 */
export const DEFAULT_SETTINGS: SuppliesSettings = { people: 2, waterLitresPerDay: 3, targetDays: 7, expiryWarningDays: 30 };

/** Volume units that count as water, in litres. */
const LITRES: Record<string, number> = { l: 1, litre: 1, litres: 1, liter: 1, liters: 1, dl: 0.1, cl: 0.01, ml: 0.001 };

/** The quantity in litres, when the unit is a volume; null otherwise. */
export function litres(quantity: number, unit: string): number | null {
  const f = LITRES[unit.trim().toLowerCase()];
  return f === undefined ? null : quantity * f;
}

/** What is stored per item; the rest of SupplyItem is computed against today. */
type StoredItem = Pick<SupplyItem, 'id' | 'name' | 'category' | 'quantity' | 'unit' | 'minimum' | 'expires' | 'location' | 'note' | 'updatedAt'>;
type Stored = { nextId: number; items: StoredItem[]; settings: SuppliesSettings };

const now = () => Math.floor(Date.now() / 1000);
const DAY_MS = 86_400_000;

/** Today as YYYY-MM-DD in the Pi's local time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from TODAY to DATE (both YYYY-MM-DD); negative = in the past. */
function daysBetween(todayIso: string, date: string): number | null {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(b) ? null : Math.round((b - a) / DAY_MS);
}



/**
 * The household's emergency stock, kept by core in
 * CORE_DATA_DIR/supplies.json (items and household settings). Held in
 * memory, every change saved at once.
 */
@Injectable()
export class SuppliesStore implements OnModuleInit {
  private readonly logger = new Logger('SuppliesStore');
  private readonly file = JsonFile.inDataDir<Partial<Stored>>('supplies.json', () => ({}));
  private data: Stored = { nextId: 1, items: [], settings: { ...DEFAULT_SETTINGS } };

  async onModuleInit(): Promise<void> {
    const raw = await this.file.load();
    const items = Array.isArray(raw.items) ? raw.items.filter((i) => CATEGORIES.includes(i?.category)) : [];
    const nextId = Math.max(Number(raw.nextId) || 1, ...items.map((i) => i.id + 1));
    this.data = { nextId, items, settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } };
    if (items.length) this.logger.log(`Loaded ${items.length} items from ${this.file.path}`);
  }

  private view(i: StoredItem, day = today()): SupplyItem {
    const daysLeft = i.expires ? daysBetween(day, i.expires) : null;
    return {
      ...i,
      daysLeft,
      expired: daysLeft !== null && daysLeft < 0,
      expiring: daysLeft !== null && daysLeft >= 0 && daysLeft <= this.data.settings.expiryWarningDays,
      low: i.minimum !== null && i.quantity < i.minimum,
    };
  }

  /** Every item, by category (in CATEGORIES order) and name. */
  items(): SupplyItem[] {
    const day = today();
    const rank = (c: Category) => CATEGORIES.indexOf(c);
    return [...this.data.items]
      .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id)
      .map((i) => this.view(i, day));
  }

  status(): SuppliesStatus {
    const items = this.items();
    const s = this.data.settings;
    const water = items
      .filter((i) => i.category === 'water' && !i.expired)
      .reduce((sum, i) => sum + (litres(i.quantity, i.unit) ?? 0), 0);
    const perDay = s.people * s.waterLitresPerDay;
    const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as unknown as CategoryCounts;
    for (const i of items) categories[i.category] += 1;
    return {
      items: items.length,
      expired: items.filter((i) => i.expired).length,
      expiring: items.filter((i) => i.expiring).length,
      low: items.filter((i) => i.low).length,
      waterLitres: Math.round(water * 100) / 100,
      waterDays: perDay > 0 ? Math.round((water / perDay) * 10) / 10 : null,
      categories,
      settings: { ...s },
      updatedAt: items.length ? Math.max(...items.map((i) => i.updatedAt)) : null,
    };
  }

  async create(body: CreateItemRequest): Promise<SupplyItem> {
    if (this.data.items.length >= MAX_ITEMS) throw new ConflictException(`The list is full (${MAX_ITEMS} items).`);
    const item: StoredItem = {
      id: this.data.nextId++,
      name: body.name,
      category: body.category ?? 'other',
      quantity: body.quantity ?? 0,
      unit: body.unit ?? '',
      minimum: body.minimum ?? null,
      expires: body.expires ?? null,
      location: body.location ?? null,
      note: body.note ?? null,
      updatedAt: now(),
    };
    this.data.items.push(item);
    await this.save();
    return this.view(item);
  }

  async update(id: number, body: UpdateItemRequest): Promise<SupplyItem> {
    const item = this.find(id);
    for (const key of ['name', 'category', 'quantity', 'unit'] as const) {
      if (body[key] !== undefined) (item as Record<string, unknown>)[key] = body[key];
    }
    for (const key of ['minimum', 'expires', 'location', 'note'] as const) {
      if (body[key] !== undefined) (item as Record<string, unknown>)[key] = body[key] ?? null;
    }
    item.updatedAt = now();
    await this.save();
    return this.view(item);
  }

  /** Add DELTA to the quantity, never below 0. */
  async adjust(id: number, delta: number): Promise<SupplyItem> {
    const item = this.find(id);
    item.quantity = Math.max(0, item.quantity + delta);
    item.updatedAt = now();
    await this.save();
    return this.view(item);
  }

  async remove(id: number): Promise<void> {
    this.find(id);
    this.data.items = this.data.items.filter((i) => i.id !== id);
    await this.save();
  }

  settings(): SuppliesSettings {
    return { ...this.data.settings };
  }

  async saveSettings(body: UpdateSettingsRequest): Promise<SuppliesSettings> {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SuppliesSettings)[]) {
      if (body[key] !== undefined) this.data.settings[key] = body[key]!;
    }
    await this.save();
    return this.settings();
  }

  private find(id: number): StoredItem {
    const item = this.data.items.find((i) => i.id === id);
    if (!item) throw new NotFoundException(`Item ${id} does not exist.`);
    return item;
  }

  private save(): Promise<void> {
    return this.file.save(this.data);
  }
}
