import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { attachUpgrade, gatewayMiddleware } from './gateway/gateway';
import { ModulesService } from './modules/modules.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
    // request bodies must reach the modules untouched; core's own API takes none
    bodyParser: false,
  });
  app.enableShutdownHooks();

  // The gateway goes first: /maps/, /mesh/, ... belong to the modules.
  const modules = app.get(ModulesService);
  app.use(gatewayMiddleware(modules));
  attachUpgrade(app.getHttpServer(), modules);

  // / home, /system/ dashboard, /ui/ the shared Outpost package
  app.useStaticAssets(join(__dirname, '..', 'public'), { redirect: true });

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, host);
  Logger.log(`offline-pi on http://${host}:${port}`, 'core');
}

void bootstrap();
