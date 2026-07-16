import { MediaCleanupService } from './media-cleanup.service';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MediaCleanupService', () => {
  it('persists a durable retry when immediate object deletion fails', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'cleanup-1' });
    const prisma = {
      mediaCleanupTask: { upsert, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaService;
    const media = {
      deleteImage: jest.fn().mockRejectedValue(new Error('R2 unavailable')),
    } as unknown as MediaService;
    const cleanup = new MediaCleanupService(prisma, media);

    await cleanup.deleteOrSchedule('evidence/exchange/request-1/photo.webp');

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { objectKey: 'evidence/exchange/request-1/photo.webp' },
      create: expect.objectContaining({ lastError: 'R2 unavailable' }),
    }));
  });

  it('keeps a tombstone after the first deletion pass', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const task = { id: 'cleanup-1', objectKey: 'evidence/a.webp', attempts: 1, deletePasses: 0, completedAt: null };
    const prisma = {
      mediaCleanupTask: {
        findMany: jest.fn().mockResolvedValue([task]),
        updateMany,
      },
    } as unknown as PrismaService;
    const media = { deleteImage: jest.fn().mockResolvedValue(undefined) } as unknown as MediaService;

    await expect(new MediaCleanupService(prisma, media).retryPending()).resolves.toEqual({ completed: 0, failed: 0 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'cleanup-1', completedAt: null }),
      data: expect.objectContaining({
        deletePasses: { increment: 1 },
        claimedAt: null,
        nextAttemptAt: expect.any(Date),
      }),
    }));
  });

  it('completes the tombstone only after a second successful deletion pass', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const task = { id: 'cleanup-1b', objectKey: 'evidence/a-late.webp', attempts: 0, deletePasses: 1, completedAt: null };
    const prisma = {
      mediaCleanupTask: { findMany: jest.fn().mockResolvedValue([task]), updateMany },
    } as unknown as PrismaService;
    const media = { deleteImage: jest.fn().mockResolvedValue(undefined) } as unknown as MediaService;

    await expect(new MediaCleanupService(prisma, media).retryPending()).resolves.toEqual({ completed: 1, failed: 0 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deletePasses: { increment: 1 }, completedAt: expect.any(Date) }),
    }));
  });

  it('keeps a failed retry pending with increasing attempts and backoff', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const task = { id: 'cleanup-2', objectKey: 'evidence/b.webp', attempts: 2, deletePasses: 0, completedAt: null };
    const prisma = {
      mediaCleanupTask: {
        findMany: jest.fn().mockResolvedValue([task]),
        updateMany,
      },
    } as unknown as PrismaService;
    const media = { deleteImage: jest.fn().mockRejectedValue(new Error('still unavailable')) } as unknown as MediaService;

    await expect(new MediaCleanupService(prisma, media).retryPending()).resolves.toEqual({ completed: 0, failed: 1 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'cleanup-2', completedAt: null, claimedAt: expect.any(Date) }),
      data: expect.objectContaining({ attempts: 3, lastError: 'still unavailable', nextAttemptAt: expect.any(Date) }),
    }));
  });

  it('contains database failures at the scheduler boundary', async () => {
    const prisma = {
      mediaCleanupTask: { findMany: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    } as unknown as PrismaService;
    const media = { deleteImage: jest.fn() } as unknown as MediaService;

    await expect(new MediaCleanupService(prisma, media).runPendingCleanup()).resolves.toBeUndefined();
  });
});
