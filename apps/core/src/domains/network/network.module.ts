import { Module } from '@nestjs/common';
import { NetworkController } from './api/network.controller';
import { NetworkClient } from './infrastructure/network.client';

/** Domain "network": the devices on the Pi's hotspot and blocking them, backed by the network container. */
@Module({
  controllers: [NetworkController],
  providers: [NetworkClient],
  exports: [NetworkClient],
})
export class NetworkModule {}
