import { rmSync } from 'node:fs';
import path from 'node:path';

export default function globalTeardown() {
  const apiPort = Number(process.env.E2E_API_PORT ?? 4200);
  rmSync(`/tmp/alistore-e2e-media-${apiPort}`, { recursive: true, force: true });
  // Playwright may terminate Next before it removes the dev lock. The
  // reconciliation profile starts several isolated runs sequentially, so a
  // stale lock must never make the next vertical fail before its tests start.
  rmSync(path.resolve(process.cwd(), 'apps/web/.next-e2e/dev/lock'), { force: true });
}
