import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useStaticAssets(process.env.MEDIA_LOCAL_DIR ?? './uploads', {
    prefix: process.env.MEDIA_PUBLIC_BASE ?? '/uploads',
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  // CORS: restrict to an explicit allowlist in production (CORS_ORIGINS="a,b"); reflect the
  // request origin in dev when unset so localhost:3000 → :4000 keeps working.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors(corsOrigins.length ? { origin: corsOrigins, credentials: true } : { origin: true });
  // Baseline security headers (dependency-free; helmet not required for these).
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  setupOpenApi(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AliStore API listening on http://localhost:${port}/api`);
}

void bootstrap();
