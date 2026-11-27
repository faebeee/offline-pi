import { Module } from '@nestjs/common';
import { SuppliesController } from './api/supplies.controller';
import { SuppliesStore } from './infrastructure/supplies.store';

/** Domain "supplies": the household's emergency stock, kept by core (CORE_DATA_DIR/supplies.json). */
@Module({
  controllers: [SuppliesController],
  providers: [SuppliesStore],
  exports: [SuppliesStore],
})
export class SuppliesModule {}
