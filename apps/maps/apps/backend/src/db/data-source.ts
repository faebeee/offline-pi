import { DataSource } from "typeorm";
import { databaseOptions } from "../config/database.ts";

/**
 * Entry point for the TypeORM CLI (`npm run -w @offline-maps/backend migration:generate`).
 * The running server does not use this — it goes through `DatabaseModule`.
 */
export default new DataSource(databaseOptions());
