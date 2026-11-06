import type { DataSourceOptions } from "typeorm";
import { PoiEntity } from "../db/entities/poi.entity.ts";
import { InitPois1761740000000 } from "../db/migrations/1761740000000-init-pois.ts";
import { PATHS } from "./paths.ts";

/** Entities and migrations are listed explicitly: glob loading does not work under ESM. */
const ENTITIES = [PoiEntity];
const MIGRATIONS = [InitPois1761740000000];

/**
 * The one place the database engine is chosen.
 *
 * Defaults to a sqlite file under `data/`, which is what a self-hosted install
 * wants. Set `DATABASE_URL=postgres://user:pass@host:5432/db` to move to
 * Postgres instead — the entities, migrations and queries are dialect-agnostic,
 * so nothing else changes.
 */
export function databaseOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL?.trim();

  const common = {
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // Schema changes go through migrations, never an implicit diff against a
    // live database — `synchronize` can silently drop columns.
    synchronize: false,
    migrationsRun: true,
    logging: process.env.DB_LOGGING === "true",
  } as const;

  if (url) {
    if (!/^postgres(ql)?:\/\//.test(url)) {
      throw new Error(`DATABASE_URL must be a postgres:// url, got "${url}"`);
    }
    return { type: "postgres", url, ...common };
  }

  return { type: "better-sqlite3", database: PATHS.db, ...common };
}
