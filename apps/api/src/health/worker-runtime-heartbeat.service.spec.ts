import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  WORKER_RUNTIME_HEARTBEAT_ID,
  WorkerRuntimeHeartbeatService,
} from './worker-runtime-heartbeat.service';

describe('WorkerRuntimeHeartbeatService', () => {
  afterEach(() => jest.useRealTimers());

  it('never writes from the API process', async () => {
    const upsert = jest.fn();
    const service = new WorkerRuntimeHeartbeatService(
      { workerHeartbeat: { upsert } } as unknown as PrismaService,
      { get: (name: string) => name === 'PROCESS_ROLE' ? 'api' : undefined } as ConfigService,
    );

    await service.onApplicationBootstrap();

    expect(upsert).not.toHaveBeenCalled();
  });

  it('writes and refreshes the exact worker revision', async () => {
    jest.useFakeTimers();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const service = new WorkerRuntimeHeartbeatService(
      { workerHeartbeat: { upsert } } as unknown as PrismaService,
      {
        get: (name: string) => ({
          PROCESS_ROLE: 'worker',
          RENDER_GIT_COMMIT: 'worker-sha-456',
        } as Record<string, string>)[name],
      } as ConfigService,
    );

    await service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(30_000);
    service.onModuleDestroy();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith({
      where: { id: WORKER_RUNTIME_HEARTBEAT_ID },
      create: { id: WORKER_RUNTIME_HEARTBEAT_ID, meta: { revision: 'worker-sha-456' } },
      update: { meta: { revision: 'worker-sha-456' } },
    });
  });
});
