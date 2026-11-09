import { Module } from '@nestjs/common';
import { LibraryController } from './api/library.controller';
import { KiwixClient } from './infrastructure/kiwix.client';

/** Domain "library": kiwix books, backed by the knowledge container. */
@Module({
  controllers: [LibraryController],
  providers: [KiwixClient],
})
export class LibraryModule {}
