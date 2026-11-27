import { Module } from '@nestjs/common';
import { BoardController } from './api/board.controller';
import { BoardStore } from './infrastructure/board.store';

/** Domain "board": the notice board, kept by core (CORE_DATA_DIR/board.json). */
@Module({
  controllers: [BoardController],
  providers: [BoardStore],
  exports: [BoardStore],
})
export class BoardModule {}
