import { EvidenceService } from './evidence.service';
import { AuditService } from '../audit/audit.service';
import { AuthzService } from '../authz/authz.service';
import { MediaCleanupService } from '../media/media-cleanup.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EvidenceService compensation', () => {
  it('deletes or durably schedules an uploaded object when the audited transaction fails', async () => {
    const transactionError = new Error('exchange changed while attaching evidence');
    const prisma = {
      inventoryMovement: { findUnique: jest.fn().mockResolvedValue({ id: 'movement-1' }) },
    } as unknown as PrismaService;
    const audit = {
      transaction: jest.fn().mockRejectedValue(transactionError),
    } as unknown as AuditService;
    const media = {
      createImageKey: jest.fn().mockReturnValue('evidence/inventory/movement-1/photo.webp'),
      prepareImage: jest.fn().mockResolvedValue({ data: Buffer.from('webp'), width: 10, height: 10 }),
      storePreparedImage: jest.fn().mockResolvedValue({
        key: 'evidence/inventory/movement-1/photo.webp',
        url: '/uploads/evidence/inventory/movement-1/photo.webp',
        width: 10,
        height: 10,
        bytes: 10,
        format: 'webp',
      }),
    } as unknown as MediaService;
    const cleanup = {
      registerIntent: jest.fn().mockResolvedValue(undefined),
      markRetainedOnTx: jest.fn().mockResolvedValue(undefined),
      deleteOrSchedule: jest.fn().mockResolvedValue(undefined),
      getReadUrl: jest.fn().mockResolvedValue('/uploads/evidence/inventory/movement-1/photo.webp'),
    } as unknown as MediaCleanupService;
    const service = new EvidenceService(
      prisma,
      audit,
      media,
      {} as AuthzService,
      cleanup,
    );

    await expect(service.attachImage(Buffer.from('image'), {
      entityType: 'inventory',
      entityId: 'movement-1',
    })).rejects.toBe(transactionError);
    expect(cleanup.deleteOrSchedule).toHaveBeenCalledWith('evidence/inventory/movement-1/photo.webp');
  });

  it('does not write to object storage when cleanup-intent persistence fails', async () => {
    const prisma = {
      inventoryMovement: { findUnique: jest.fn().mockResolvedValue({ id: 'movement-1' }) },
    } as unknown as PrismaService;
    const media = {
      createImageKey: jest.fn().mockReturnValue('evidence/inventory/movement-1/photo.webp'),
      prepareImage: jest.fn().mockResolvedValue({ data: Buffer.from('webp'), width: 10, height: 10 }),
      storePreparedImage: jest.fn(),
    } as unknown as MediaService;
    const persistenceError = new Error('database unavailable');
    const cleanup = {
      registerIntent: jest.fn().mockRejectedValue(persistenceError),
    } as unknown as MediaCleanupService;
    const service = new EvidenceService(
      prisma,
      {} as AuditService,
      media,
      {} as AuthzService,
      cleanup,
    );

    await expect(service.attachImage(Buffer.from('image'), {
      entityType: 'inventory',
      entityId: 'movement-1',
    })).rejects.toBe(persistenceError);
    expect(media.storePreparedImage).not.toHaveBeenCalled();
  });
});
