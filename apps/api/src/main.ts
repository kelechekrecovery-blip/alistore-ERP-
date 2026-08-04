import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { setupOpenApi, shouldExposeOpenApi } from './openapi';
import helmet from 'helmet';
import {
  allowedHostsMiddleware,
  resolveCorsOptions,
  resolveHelmetOptions,
  resolveTrustProxy,
} from './config/runtime-security';
import { resolveRuntimeEnvFiles } from './config/runtime-env-files';
import { assertProductionRuntimeReady } from './health/production-preflight';

function preloadRuntimeEnvFiles(): void {
  for (const envFile of resolveRuntimeEnvFiles(process.env.NODE_ENV)) {
    if (!existsSync(envFile)) continue;
    dotenv.config({ path: envFile, override: false });
  }
}

async function bootstrap(): Promise<void> {
  preloadRuntimeEnvFiles();
  const env = (name: string) => process.env[name];
  assertProductionRuntimeReady(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // До этой строки req.ip был адресом прокси, а не клиента — см. resolveTrustProxy.
  app.set('trust proxy', resolveTrustProxy(env));
  app.use(allowedHostsMiddleware(env));
  app.setGlobalPrefix('api');
  app.useStaticAssets(process.env.MEDIA_LOCAL_DIR ?? './uploads', {
    prefix: process.env.MEDIA_PUBLIC_BASE ?? '/uploads',
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors(resolveCorsOptions(env));
  app.use(helmet(resolveHelmetOptions(env)));
  setupOpenApi(app, shouldExposeOpenApi());
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AliStore API listening on http://localhost:${port}/api`);
}

void bootstrap();
