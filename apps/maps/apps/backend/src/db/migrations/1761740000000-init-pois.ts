import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

/**
 * Creates the `pois` table.
 *
 * Written against TypeORM's schema API rather than raw SQL so it runs on any
 * dialect; the handful of genuinely engine-specific spellings (uuid, timestamp,
 * the clock function) are picked from the connection at run time.
 */
export class InitPois1761740000000 implements MigrationInterface {
  name = "InitPois1761740000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === "postgres";
    const uuid = isPostgres ? "uuid" : "varchar";
    const timestamp = isPostgres ? "timestamp" : "datetime";
    const now = isPostgres ? "now()" : "datetime('now')";

    await queryRunner.createTable(
      new Table({
        name: "pois",
        columns: [
          { name: "id", type: uuid, isPrimary: true },
          { name: "name", type: "varchar", length: "80", isNullable: false },
          { name: "emoji", type: "varchar", length: "16", isNullable: false },
          { name: "lat", type: "double precision", isNullable: false },
          { name: "lon", type: "double precision", isNullable: false },
          { name: "created_at", type: timestamp, isNullable: false, default: now },
          { name: "updated_at", type: timestamp, isNullable: false, default: now },
        ],
      }),
    );

    // POIs are listed by map viewport, which is a range scan on both columns.
    await queryRunner.createIndex(
      "pois",
      new TableIndex({ name: "pois_lat_lon", columnNames: ["lat", "lon"] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("pois", "pois_lat_lon");
    await queryRunner.dropTable("pois");
  }
}
