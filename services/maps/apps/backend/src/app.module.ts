import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SameOriginGuard } from "./common/same-origin.guard.ts";
import { AssetsModule } from "./assets/assets.module.ts";
import { DatabaseModule } from "./db/db.module.ts";
import { DownloadsModule } from "./downloads/downloads.module.ts";
import { JobsModule } from "./jobs/jobs.module.ts";
import { PlacesModule } from "./places/places.module.ts";
import { PoisModule } from "./pois/pois.module.ts";
import { RegionsModule } from "./regions/regions.module.ts";
import { SetupModule } from "./setup/setup.module.ts";
import { SpaModule } from "./spa/spa.module.ts";
import { StylesModule } from "./styles/styles.module.ts";

/**
 * SpaModule is imported last on purpose: it owns the catch-all route that
 * serves the viewer, and must not shadow the API routes.
 */
@Module({
  imports: [
    DatabaseModule,
    RegionsModule,
    StylesModule,
    AssetsModule,
    PlacesModule,
    PoisModule,
    JobsModule,
    DownloadsModule,
    SetupModule,
    SpaModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SameOriginGuard }],
})
export class AppModule {}
