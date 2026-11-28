import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { dirname } from 'node:path';
import { AppModule } from './app.module';
import { AuthIoAdapter } from './platform/auth/auth-io.adapter';
import { authMiddleware } from './platform/auth/auth.middleware';
import { AuthService } from './platform/auth/auth.service';
import { CoreLogger } from './platform/logging/core-logger';
import { ErrorsFilter } from './platform/http/errors.filter';
import { ModulesService } from './platform/modules/modules.service';
import { buildOpenApi } from './platform/openapi/openapi';
import { attachUpgrade, gatewayMiddleware } from './platform/passthrough/passthrough';
import { serveWeb } from './platform/web/web';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's console logger that also keeps the lines for the logs screen
    // (CORE_LOG_LEVEL sets the least severe level, default "log")
    logger: new CoreLogger(),
    // the passthrough (/svc/) must get request bodies untouched; the JSON
    // parser is added after it, so only core's own API parses bodies
    bodyParser: false,
  });
  app.enableShutdownHooks();
  // routes match exactly as written: "/API/users" is not "/api/users" (the
  // login rules compare normalized paths as well, auth.middleware.ts)
  app.getHttpAdapter().getInstance().set('case sensitive routing', true);

  // the login: every /api/ and /svc/ request needs a session (or the
  // scripts' local token), except what the login screen itself needs; the
  // Socket.IO namespaces check it in AuthIoAdapter
  // Admin-only screens ("admin": true in their manifest) are admin-only in
  // the API (/api/<id>/) and over Socket.IO (/<id>) too.
  const modules = app.get(ModulesService);
  const adminIds = () => modules.list().filter((m) => m.adminOnly).map((m) => m.id);
  const auth = app.get(AuthService);
  app.use(authMiddleware(auth, adminIds));
  app.useWebSocketAdapter(new AuthIoAdapter(app, auth, adminIds));

  // /svc/<module>/: raw passthrough to the module containers (tiles, fonts,
  // pmtiles ranges, kiwix articles). Before the body parser, so it sees
  // untouched requests.
  app.use(gatewayMiddleware(modules));
  attachUpgrade(app.getHttpServer(), modules, (req) => !!auth.resolve(req.headers.cookie, req.headers.authorization, req.socket.remoteAddress));

  // core's API: /api/<domain>/...
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ErrorsFilter(app.getHttpAdapter()));
  SwaggerModule.setup('api/docs', app, () => buildOpenApi(app), { jsonDocumentUrl: 'api/openapi.json' });

  // /ui/: the shared Outpost package (@outpost/ui)
  const uiDir = dirname(require.resolve('@outpost/ui/package.json'));
  app.useStaticAssets(uiDir, { prefix: '/ui/', redirect: true });

  // /: the web app (apps/web), with client-side routes
  serveWeb(app);

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, host);
  Logger.log(`outpost on http://${host}:${port}`, 'core');
}

void bootstrap();
