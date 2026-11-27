import { Module } from '@nestjs/common';
import { SuppliesController } from './api/supplies.controller';
import { SuppliesClient } from './infrastructure/supplies.client';

/** Domain "supplies": the household's emergency stock, backed by the supplies container. */
@Module({
  controllers: [SuppliesController],
  providers: [SuppliesClient],
  exports: [SuppliesClient],
})
export class SuppliesModule {}
