import { NestFactory } from '@nestjs/core';
import {
  isLaunchdManagedWorker,
  loadLaunchdWorkerEnvironmentSnapshot,
  preloadRuntimeEnvFiles,
} from './config/runtime-env-files';
import { assertProductionRuntimeReady } from './health/production-preflight';

async function bootstrap(): Promise<void> {
  if (isLaunchdManagedWorker(process.env)) {
    loadLaunchdWorkerEnvironmentSnapshot(process.env);
  } else {
    process.env.PROCESS_ROLE = 'worker';
    preloadRuntimeEnvFiles(process.env.NODE_ENV);
  }
  process.env.PROCESS_ROLE = 'worker';
  assertProductionRuntimeReady((name) => process.env[name]);
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('AliStore worker ready');
}

void bootstrap();
