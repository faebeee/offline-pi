import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, host);
  Logger.log(`Dashboard on http://${host}:${port}`, 'pi-monitor');
}

void bootstrap();
