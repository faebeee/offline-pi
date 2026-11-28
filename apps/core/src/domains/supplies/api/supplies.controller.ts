import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { assertControl, assertCsrf } from '../../../platform/http/control-guard';
import {
  AdjustItemRequest,
  CreateItemRequest,
  SuppliesSettings,
  SuppliesStatus,
  SupplyItem,
  UpdateItemRequest,
  UpdateSettingsRequest,
} from '../domain/supplies.dto';
import { SuppliesStore } from '../infrastructure/supplies.store';

/**
 * Domain "supplies": the household's emergency stock (what, how much,
 * where, until when), kept by core itself (CORE_DATA_DIR/supplies.json). Anyone on the
 * network may add and change items; deleting one is a control action
 * (admin only).
 */
@ApiTags('supplies')
@Controller('api/supplies')
export class SuppliesController {
  constructor(private readonly supplies: SuppliesStore) {}

  /** Counts, warnings (expired, expiring, low) and how many days the water lasts. */
  @Get('status')
  status(): SuppliesStatus {
    return this.supplies.status();
  }

  /** Every item, by category and name. */
  @Get('items')
  items(): SupplyItem[] {
    return this.supplies.items();
  }

  /** Add an item. */
  @Post('items')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  create(@Body() body: CreateItemRequest, @Headers('x-pi-monitor') piMonitor: string | undefined): Promise<SupplyItem> {
    assertCsrf(piMonitor);
    return this.supplies.create(body);
  }

  /** Change an item. */
  @Patch('items/:id')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateItemRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
  ): Promise<SupplyItem> {
    assertCsrf(piMonitor);
    return this.supplies.update(id, body);
  }

  /** Add to or take from an item's quantity (never below 0). */
  @Post('items/:id/adjust')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdjustItemRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
  ): Promise<SupplyItem> {
    assertCsrf(piMonitor);
    return this.supplies.adjust(id, body.delta);
  }

  /** Delete an item. */
  @Delete('items/:id')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<void> {
    assertControl(piMonitor, user);
    return this.supplies.remove(id);
  }

  /** People, water per day, target days and the expiry warning window. */
  @Get('settings')
  settings(): SuppliesSettings {
    return this.supplies.settings();
  }

  /** Change the settings. */
  @Put('settings')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  saveSettings(@Body() body: UpdateSettingsRequest, @Headers('x-pi-monitor') piMonitor: string | undefined): Promise<SuppliesSettings> {
    assertCsrf(piMonitor);
    return this.supplies.saveSettings(body);
  }
}
