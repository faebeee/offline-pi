import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseOptions } from "../config/database.ts";

/**
 * Opens the database and runs any pending migrations on boot. Which engine that
 * is lives in `config/database.ts`; nothing else in the app knows or cares.
 */
@Module({
  imports: [TypeOrmModule.forRoot(databaseOptions())],
})
export class DatabaseModule {}
