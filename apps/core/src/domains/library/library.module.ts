import { Module } from '@nestjs/common';
import { LibraryController } from './api/library.controller';
import { KiwixClient } from './infrastructure/kiwix.client';
import { SyncStatusReader } from './infrastructure/sync-status.reader';

/** Domain "library": kiwix books, backed by the knowledge container. */
@Module({
  controllers: [LibraryController],
  providers: [KiwixClient, SyncStatusReader],
})
export class LibraryModule {}
