import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertProductionRuntimeReady } from './health/production-preflight';

async function bootstrap(): Promise<void> {
  process.env.PROCESS_ROLE = 'worker';
  assertProductionRuntimeReady((name) => process.env[name]);
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('AliStore worker ready');
}

void bootstrap();
