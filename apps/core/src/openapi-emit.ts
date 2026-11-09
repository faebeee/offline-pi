/**
 * Writes core's OpenAPI document to packages/api-client/openapi.json without
 * starting anything (preview mode: no providers run, no modules needed).
 * `npm run api:gen` at the root runs this, then orval.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module';
import { buildOpenApi } from './platform/openapi/openapi';

async function main() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  const doc = buildOpenApi(app);
  const out = resolve(process.argv[2] ?? join(__dirname, '..', '..', '..', 'packages', 'api-client', 'openapi.json'));
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}

void main();
