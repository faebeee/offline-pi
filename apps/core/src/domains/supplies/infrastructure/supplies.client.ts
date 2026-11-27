import { Injectable } from '@nestjs/common';
import { UpstreamClient, UpstreamService } from '../../../platform/upstream/upstream.service';
import type {
  Category,
  CategoryCounts,
  CreateItemRequest,
  SuppliesSettings,
  SuppliesStatus,
  SupplyItem,
  UpdateItemRequest,
  UpdateSettingsRequest,
} from '../domain/supplies.dto';

type Raw = Record<string, unknown>;

const toItem = (r: Raw): SupplyItem => ({
  id: Number(r.id),
  name: String(r.name ?? ''),
  category: r.category as Category,
  quantity: Number(r.quantity) || 0,
  unit: String(r.unit ?? ''),
  minimum: r.minimum == null ? null : Number(r.minimum),
  expires: (r.expires as string | null) ?? null,
  location: (r.location as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  daysLeft: r.days_left == null ? null : Number(r.days_left),
  expired: !!r.expired,
  expiring: !!r.expiring,
  low: !!r.low,
  updatedAt: Number(r.updated_at) || 0,
});

const toSettings = (r: Raw): SuppliesSettings => ({
  people: Number(r.people),
  waterLitresPerDay: Number(r.water_litres_per_day),
  targetDays: Number(r.target_days),
  expiryWarningDays: Number(r.expiry_warning_days),
});

/** camelCase request -> the container's snake_case, keeping null (clears a field). */
const snake = (body: object): Raw => {
  const out: Raw = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
};

/** The supplies container's HTTP API (apps/supplies, FastAPI), on loopback. */
@Injectable()
export class SuppliesClient {
  constructor(private readonly upstream: UpstreamService) {}

  get c(): UpstreamClient {
    return this.upstream.client('supplies');
  }

  async status(): Promise<SuppliesStatus> {
    const r = await this.c.get<Raw>('/api/status');
    return {
      items: Number(r.items) || 0,
      expired: Number(r.expired) || 0,
      expiring: Number(r.expiring) || 0,
      low: Number(r.low) || 0,
      waterLitres: Number(r.water_litres) || 0,
      waterDays: r.water_days == null ? null : Number(r.water_days),
      categories: r.categories as CategoryCounts,
      settings: toSettings(r.settings as Raw),
      updatedAt: (r.updated_at as number | null) ?? null,
    };
  }

  async items(): Promise<SupplyItem[]> {
    return (await this.c.get<Raw[]>('/api/items')).map(toItem);
  }

  async create(body: CreateItemRequest): Promise<SupplyItem> {
    return toItem(await this.c.post<Raw>('/api/items', snake(body)));
  }

  async update(id: number, body: UpdateItemRequest): Promise<SupplyItem> {
    return toItem(await this.c.patch<Raw>(`/api/items/${id}`, snake(body)));
  }

  async adjust(id: number, delta: number): Promise<SupplyItem> {
    return toItem(await this.c.post<Raw>(`/api/items/${id}/adjust`, { delta }));
  }

  async remove(id: number): Promise<void> {
    await this.c.delete<void>(`/api/items/${id}`);
  }

  async settings(): Promise<SuppliesSettings> {
    return toSettings(await this.c.get<Raw>('/api/settings'));
  }

  async saveSettings(body: UpdateSettingsRequest): Promise<SuppliesSettings> {
    return toSettings(await this.c.request<Raw>('PUT', '/api/settings', { body: snake(body) }));
  }
}
