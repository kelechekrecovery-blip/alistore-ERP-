import { rmSync } from 'node:fs';

export default function globalSetup() {
  const apiPort = Number(process.env.E2E_API_PORT ?? 4200);
  rmSync(`/tmp/alistore-e2e-media-${apiPort}`, { recursive: true, force: true });
}
