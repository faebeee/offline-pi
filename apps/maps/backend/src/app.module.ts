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
import { StylesModule } from "./styles/styles.module.ts";

/**
 * The maps container: API, tiles and assets only. Its UI is the web app
 * (apps/web, /maps), which reaches it through core's maps domain
 * (/api/maps/...) and passthrough (/svc/maps/...).
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
  ],
  providers: [{ provide: APP_GUARD, useClass: SameOriginGuard }],
})
export class AppModule {}
