import { Module } from '@nestjs/common';
import { LibraryController } from './api/library.controller';
import { CatalogService } from './application/catalog.service';
import { ContentDir } from './infrastructure/content-dir';
import { KiwixClient } from './infrastructure/kiwix.client';
import { KnowledgeCommands } from './infrastructure/knowledge.commands';
import { SyncStatusReader } from './infrastructure/sync-status.reader';

/** Domain "library": kiwix books, backed by the knowledge container. */
@Module({
  controllers: [LibraryController],
  providers: [KiwixClient, ContentDir, SyncStatusReader, KnowledgeCommands, CatalogService],
})
export class LibraryModule {}
