import type { INestApplication, Type } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Models that only travel over Socket.IO (event payloads). OpenAPI has no
 * place for them in a path, so they are added as extra schemas: the web
 * app gets their types from @offline-pi/api-client like every other DTO.
 * Each domain's *.events.ts registers its own.
 */
const eventModels = new Set<Type<unknown>>();

export function registerEventModels(...models: Type<unknown>[]) {
  for (const m of models) eventModels.add(m);
}

const lcfirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The OpenAPI document of core's API. Operation ids are
 * <controller without "Controller"><Method>, e.g. MapsController.regions ->
 * "mapsRegions", which orval turns into useMapsRegions() in the web app.
 */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('offline-pi')
    .setDescription('The API of offline-pi: one domain per feature, under /api/<domain>/.')
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      lcfirst(controllerKey.replace(/Controller$/, '')) + ucfirst(methodKey),
    extraModels: [...eventModels],
  });
}
