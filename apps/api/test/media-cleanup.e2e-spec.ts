import { MediaCleanupService } from '../src/media/media-cleanup.service';
import { MediaService } from '../src/media/media.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Media cleanup retention race (integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.mediaCleanupTask.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.mediaCleanupTask.deleteMany();
  });

  it('never commits retention after a selected cleanup has locked and deleted the object', async () => {
    const objectKey = `race/${Date.now()}-delete-first.webp`;
    let releaseDelete!: () => void;
    let signalDeleteStarted!: () => void;
    const deleteStarted = new Promise<void>((resolve) => { signalDeleteStarted = resolve; });
    const deleteRelease = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const media = {
      deleteImage: jest.fn().mockImplementation(async () => {
        signalDeleteStarted();
        await deleteRelease;
      }),
    } as unknown as MediaService;
    const cleanup = new MediaCleanupService(prisma, media);
    await cleanup.registerIntent(objectKey);
    await prisma.mediaCleanupTask.update({
      where: { objectKey },
      data: { uploadLeaseUntil: new Date(0) },
    });

    const cleanupPass = cleanup.retryPending();
    await deleteStarted;
    const retention = expect(
      prisma.$transaction((tx) => cleanup.markRetainedOnTx(tx, objectKey)),
    ).rejects.toThrow(`media cleanup intent missing for ${objectKey}`);
    releaseDelete();

    await expect(cleanupPass).resolves.toEqual(expect.objectContaining({ completed: 0 }));
    await retention;
    expect(media.deleteImage).toHaveBeenCalledTimes(1);
  });

  it('does not delete an object after retention wins the row lock', async () => {
    const objectKey = `race/${Date.now()}-retain-first.webp`;
    const media = { deleteImage: jest.fn() } as unknown as MediaService;
    const cleanup = new MediaCleanupService(prisma, media);
    await cleanup.registerIntent(objectKey);
    await prisma.$transaction((tx) => cleanup.markRetainedOnTx(tx, objectKey));

    await expect(cleanup.retryPending()).resolves.toEqual({ completed: 0, failed: 0 });
    expect(media.deleteImage).not.toHaveBeenCalled();
  });

  it('keeps a committed claim when finalization crashes after object deletion', async () => {
    const objectKey = `race/${Date.now()}-crash-after-delete.webp`;
    const media = { deleteImage: jest.fn().mockResolvedValue(undefined) } as unknown as MediaService;
    const cleanupPrisma = Object.create(prisma) as PrismaService;
    Object.defineProperty(cleanupPrisma, 'mediaCleanupTask', {
      value: {
        findMany: prisma.mediaCleanupTask.findMany.bind(prisma.mediaCleanupTask),
        upsert: prisma.mediaCleanupTask.upsert.bind(prisma.mediaCleanupTask),
        updateMany: jest.fn().mockImplementation(async (args) => {
          if (args.data?.completedAt) throw new Error('simulated worker crash after delete');
          return prisma.mediaCleanupTask.updateMany(args);
        }),
      },
    });
    const cleanup = new MediaCleanupService(cleanupPrisma, media);
    await cleanup.registerIntent(objectKey);
    await prisma.mediaCleanupTask.update({
      where: { objectKey },
      data: { uploadLeaseUntil: new Date(0), deletePasses: 1 },
    });

    await expect(cleanup.retryPending()).rejects.toThrow('simulated worker crash after delete');
    await expect(prisma.$transaction((tx) => cleanup.markRetainedOnTx(tx, objectKey)))
      .rejects.toThrow(`media cleanup intent missing for ${objectKey}`);
    expect(await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { objectKey } }))
      .toMatchObject({ completedAt: null, claimedAt: expect.any(Date) });
    expect(media.deleteImage).toHaveBeenCalledTimes(1);
  });

  it('does not clean a pre-registered key while its upload lease is active', async () => {
    const objectKey = `race/${Date.now()}-uploading.webp`;
    const media = { deleteImage: jest.fn() } as unknown as MediaService;
    const cleanup = new MediaCleanupService(prisma, media);
    await cleanup.registerIntent(objectKey);

    await expect(cleanup.retryPending()).resolves.toEqual({ completed: 0, failed: 0 });
    expect(media.deleteImage).not.toHaveBeenCalled();
    await expect(prisma.$transaction((tx) => cleanup.markRetainedOnTx(tx, objectKey)))
      .resolves.toBeUndefined();
  });

  it('retains a tombstone that removes an upload published after the first cleanup pass', async () => {
    const objectKey = `race/${Date.now()}-late-upload.webp`;
    const media = { deleteImage: jest.fn().mockResolvedValue(undefined) } as unknown as MediaService;
    const cleanup = new MediaCleanupService(prisma, media);
    await cleanup.registerIntent(objectKey);
    await prisma.mediaCleanupTask.update({
      where: { objectKey },
      data: { uploadLeaseUntil: new Date(0) },
    });

    await expect(cleanup.retryPending()).resolves.toEqual({ completed: 0, failed: 0 });
    expect(await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { objectKey } }))
      .toMatchObject({ completedAt: null, deletePasses: 1, claimedAt: null });

    // The original uploader can publish after the first delete and crash before
    // invoking compensation. The durable second pass must still delete it.
    await prisma.mediaCleanupTask.update({
      where: { objectKey },
      data: { nextAttemptAt: new Date(0) },
    });
    await expect(cleanup.retryPending()).resolves.toEqual({ completed: 1, failed: 0 });

    expect(media.deleteImage).toHaveBeenCalledTimes(2);
    expect(await prisma.mediaCleanupTask.findUniqueOrThrow({ where: { objectKey } }))
      .toMatchObject({ completedAt: expect.any(Date), deletePasses: 2, claimedAt: expect.any(Date) });
  });
});
