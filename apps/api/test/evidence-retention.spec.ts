import { ConfigService } from '@nestjs/config';
import { EvidenceService } from '../src/evidence/evidence.service';
import { EvidenceRetentionService } from '../src/evidence/evidence-retention.service';
import { decideEvidenceRetention } from '../src/evidence/evidence-retention.policy';

describe('Evidence PII retention', () => {
  it('classifies only explicit trade-in identity labels and computes a bounded deadline', () => {
    const config = new ConfigService({ EVIDENCE_PII_RETENTION_DAYS: '30', EVIDENCE_RETENTION_POLICY_VERSION: 'kg-privacy-test' });
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    expect(decideEvidenceRetention(config, 'tradein', 'passport_front', createdAt)).toMatchObject({
      isPii: true,
      retentionUntil: new Date('2026-01-31T00:00:00.000Z'),
      policyVersion: 'kg-privacy-test',
    });
    expect(decideEvidenceRetention(config, 'tradein', 'imei_photo', createdAt)).toMatchObject({
      isPii: false,
      retentionUntil: null,
    });
    expect(decideEvidenceRetention(config, 'warranty', 'passport_front', createdAt).isPii).toBe(false);
  });

  it('deletes expired PII, redacts the stored asset and appends a purge event', async () => {
    const candidate = {
      id: 'upload-1',
      entityType: 'tradein',
      entityId: 'tradein-1',
      asset: { key: 'evidence/tradein/tradein-1/passport.webp', format: 'webp', width: 10, height: 10, bytes: 12 },
    };
    const prisma = {
      evidenceUpload: {
        findMany: jest.fn().mockResolvedValue([candidate]),
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn(),
      },
    } as any;
    const media = { deleteImage: jest.fn().mockResolvedValue(undefined) } as any;
    const audit = {
      transaction: jest.fn(async (work: any) => work({
        evidenceUpload: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      })),
    } as any;
    const service = new EvidenceRetentionService(prisma, media, audit);

    await expect(service.runDuePurges()).resolves.toEqual({ purged: 1, failed: 0 });
    expect(media.deleteImage).toHaveBeenCalledWith(candidate.asset.key);
    expect(audit.transaction).toHaveBeenCalledTimes(1);
    const transactionWork = audit.transaction.mock.calls[0][0];
    const tx = { evidenceUpload: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await transactionWork(tx);
    expect(tx.evidenceUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purgedAt: expect.any(Date), purgeReason: 'retention_expired' }),
    }));
  });

  it('keeps an expired object retryable when storage deletion fails', async () => {
    const prisma = {
      evidenceUpload: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'upload-2', entityType: 'tradein', entityId: 'tradein-2',
          asset: { key: 'evidence/tradein/tradein-2/passport.webp' },
        }]),
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ purgeAttempts: 0 }),
      },
    } as any;
    const media = { deleteImage: jest.fn().mockRejectedValue(new Error('R2 unavailable')) } as any;
    const audit = { transaction: jest.fn() } as any;
    const service = new EvidenceRetentionService(prisma, media, audit);

    await expect(service.runDuePurges()).resolves.toEqual({ purged: 0, failed: 1 });
    expect(audit.transaction).not.toHaveBeenCalled();
    expect(prisma.evidenceUpload.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purgeAttempts: 1, nextPurgeAt: expect.any(Date) }),
    }));
  });

  it('rejects reads after an evidence asset has been purged', async () => {
    const prisma = {
      evidenceUpload: {
        findUnique: jest.fn().mockResolvedValue({
          idempotencyKey: 'purged-1',
          entityType: 'tradein',
          entityId: 'tradein-1',
          label: 'passport_front',
          purgedAt: new Date('2026-02-01T00:00:00.000Z'),
          asset: { purged: true },
        }),
      },
    } as any;
    const service = new EvidenceService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.issueRead('purged-1', 'staff:1'))
      .rejects.toMatchObject({ code: 'evidence_purged' });
  });
});
