import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AuditService } from '../src/audit/audit.service';
import { ValidationError } from '../src/common/errors';
import { EvidenceService } from '../src/evidence/evidence.service';
import { MediaService } from '../src/media/media.service';
import { LocalDiskStorage } from '../src/media/storage/local-disk.storage';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Evidence Vault (integration)', () => {
  let prisma: PrismaService;
  let evidence: EvidenceService;
  let dir: string;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    dir = await mkdtemp(join(tmpdir(), 'alistore-evidence-'));
    const config = {
      get: (key: string) =>
        ({ MEDIA_LOCAL_DIR: dir, MEDIA_PUBLIC_BASE: '/uploads' } as Record<string, string>)[key],
    } as unknown as ConfigService;
    evidence = new EvidenceService(
      prisma,
      new AuditService(prisma),
      new MediaService(new LocalDiskStorage(config)),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  });

  async function pngBuffer(): Promise<Buffer> {
    return sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 250, g: 90, b: 40 },
      },
    }).png().toBuffer();
  }

  async function movement() {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `EV-${seq}`, name: 'Evidence Phone', price: 1, cost: 1, category: 'phones', attrs: {} },
    });
    return prisma.inventoryMovement.create({
      data: { productId: product.id, qty: -1, type: 'count', from: 'BISHKEK-1', reason: 'photo proof' },
    });
  }

  it('stores evidence image and links it in the Event Ledger', async () => {
    const mv = await movement();
    const res = await evidence.attachImage(await pngBuffer(), {
      entityType: 'inventory',
      entityId: mv.id,
      label: 'shelf_photo',
      actor: 'warehouse',
    });

    expect(res.asset.format).toBe('webp');
    expect(res.asset.key).toMatch(new RegExp(`^evidence/inventory/${mv.id}/.+\\.webp$`));
    expect(res.label).toBe('shelf_photo');

    const event = await prisma.auditEvent.findFirst({ where: { type: 'evidence.attached' } });
    expect(event?.actor).toBe('warehouse');
    expect(event?.refs).toEqual(expect.arrayContaining([mv.id, res.asset.key]));
    expect(event?.payload).toMatchObject({
      entityType: 'inventory',
      entityId: mv.id,
      label: 'shelf_photo',
    });
  });

  it('rejects evidence for an unknown entity', async () => {
    const err = await evidence.attachImage(await pngBuffer(), {
      entityType: 'return',
      entityId: 'missing',
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('evidence_entity_not_found');
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});
