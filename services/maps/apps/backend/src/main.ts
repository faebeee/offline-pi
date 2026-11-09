import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";
import { corsMiddleware } from "./common/cors.middleware.ts";
import { HOST, PORT } from "./config/server.ts";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Map data stays world-readable for QGIS and the pmtiles CLI; /api only
  // answers the viewer's own origin. See cors.middleware.ts.
  app.use(corsMiddleware);
  app.enableShutdownHooks();

  await app.listen(PORT, HOST);
  Logger.log(`offline-maps backend on http://${HOST}:${PORT}`, "Bootstrap");
}

await bootstrap();
