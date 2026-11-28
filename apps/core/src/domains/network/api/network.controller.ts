import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { assertControl } from '../../../platform/http/control-guard';
import { BlockRequest, HotspotClient, HotspotRequest, HotspotState, NetworkStatus } from '../domain/network.dto';
import { NetworkClient } from '../infrastructure/network.client';

/** "::ffff:10.42.0.5" -> "10.42.0.5" */
const plainIp = (ip: string | undefined) => ip?.replace(/^::ffff:/, '');

/**
 * Domain "network": the devices on the Pi's Wi-Fi hotspot (the network
 * container reads them) and blocking them. Blocks are control actions like
 * module start/stop: X-Pi-Monitor header and an admin. The host helper
 * host/network-guard enforces them in the firewall and switches the hotspot.
 */
@ApiTags('network')
@Controller('api/network')
export class NetworkController {
  constructor(private readonly network: NetworkClient) {}

  /** The hotspot interface, counts and whether blocking is enforced. */
  @Get('status')
  status(): Promise<NetworkStatus> {
    return this.network.status();
  }

  /**
   * Switch the Pi's Wi-Fi hotspot on or off. The host helper does it within
   * a few seconds (`pending` until then); every device on the hotspot loses
   * its connection when it goes off.
   */
  @Post('hotspot')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  hotspot(
    @Body() body: HotspotRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<HotspotState> {
    assertControl(piMonitor, user);
    return this.network.switchHotspot(body.on);
  }

  /** Every device connected now, blocked, or seen in the last 30 days; connected first. */
  @Get('clients')
  clients(@Ip() ip: string): Promise<HotspotClient[]> {
    return this.network.clients(plainIp(ip));
  }

  /** Block a device by MAC: it gets disconnected and no traffic through the Pi. */
  @Post('clients/:mac/block')
  @HttpCode(200)
  @ApiParam({ name: 'mac', example: 'b8:27:eb:11:22:33' })
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  block(
    @Param('mac') mac: string,
    @Body() body: BlockRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
    @Ip() ip: string,
  ): Promise<HotspotClient> {
    assertControl(piMonitor, user);
    return this.network.block(mac, body.note, plainIp(ip));
  }

  /** Let a blocked device back in. */
  @Delete('clients/:mac/block')
  @ApiParam({ name: 'mac', example: 'b8:27:eb:11:22:33' })
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  unblock(
    @Param('mac') mac: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
    @Ip() ip: string,
  ): Promise<HotspotClient> {
    assertControl(piMonitor, user);
    return this.network.unblock(mac, plainIp(ip));
  }

  /** Remove a device that is gone from the list (blocked devices: unblock first). */
  @Delete('clients/:mac')
  @HttpCode(204)
  @ApiParam({ name: 'mac', example: 'b8:27:eb:11:22:33' })
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  forget(
    @Param('mac') mac: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<void> {
    assertControl(piMonitor, user);
    return this.network.forget(mac);
  }
}
