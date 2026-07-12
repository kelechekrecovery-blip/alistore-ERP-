import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi';
import helmet from 'helmet';
import { resolveCorsOptions, resolveHelmetOptions } from './config/runtime-security';
import { assertProductionRuntimeReady } from './health/production-preflight';

async function bootstrap(): Promise<void> {
  const env = (name: string) => process.env[name];
  assertProductionRuntimeReady(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.useStaticAssets(process.env.MEDIA_LOCAL_DIR ?? './uploads', {
    prefix: process.env.MEDIA_PUBLIC_BASE ?? '/uploads',
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors(resolveCorsOptions(env));
  app.use(helmet(resolveHelmetOptions(env)));
  setupOpenApi(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AliStore API listening on http://localhost:${port}/api`);
}

void bootstrap();
