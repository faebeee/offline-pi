import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { dirname } from 'node:path';
import { AppModule } from './app.module';
import { ErrorsFilter } from './platform/http/errors.filter';
import { ModulesService } from './platform/modules/modules.service';
import { buildOpenApi } from './platform/openapi/openapi';
import { attachUpgrade, gatewayMiddleware } from './platform/passthrough/passthrough';
import { serveWeb } from './platform/web/web';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
    // the passthrough (/svc/) must get request bodies untouched; the JSON
    // parser is added after it, so only core's own API parses bodies
    bodyParser: false,
  });
  app.enableShutdownHooks();

  // /svc/<module>/: raw passthrough to the module containers (tiles, fonts,
  // pmtiles ranges, kiwix articles). First, so it sees untouched requests.
  const modules = app.get(ModulesService);
  app.use(gatewayMiddleware(modules));
  attachUpgrade(app.getHttpServer(), modules);

  // core's API: /api/<domain>/...
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ErrorsFilter(app.getHttpAdapter()));
  SwaggerModule.setup('api/docs', app, () => buildOpenApi(app), { jsonDocumentUrl: 'api/openapi.json' });

  // /ui/: the shared Outpost package (@offline-pi/ui)
  const uiDir = dirname(require.resolve('@offline-pi/ui/package.json'));
  app.useStaticAssets(uiDir, { prefix: '/ui/', redirect: true });

  // /: the web app (apps/web), with client-side routes
  serveWeb(app);

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, host);
  Logger.log(`offline-pi on http://${host}:${port}`, 'core');
}

void bootstrap();
