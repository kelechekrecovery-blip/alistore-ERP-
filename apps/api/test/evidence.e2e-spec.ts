import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AuditService } from '../src/audit/audit.service';
import { ValidationError } from '../src/common/errors';
import { ForbiddenException } from '@nestjs/common';
import { EvidenceService } from '../src/evidence/evidence.service';
import { MediaService } from '../src/media/media.service';
import { MediaCleanupService } from '../src/media/media-cleanup.service';
import { LocalDiskStorage } from '../src/media/storage/local-disk.storage';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthzService } from '../src/authz/authz.service';

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
    const media = new MediaService(new LocalDiskStorage(config));
    evidence = new EvidenceService(
      prisma,
      new AuditService(prisma),
      media,
      { can: async () => true } as unknown as AuthzService,
      new MediaCleanupService(prisma, media),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExchangeRequest" CASCADE');
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany({ where: { serviceWorkOrderId: { not: null } } });
    await prisma.loanerLoan.deleteMany();
    await prisma.loanerDevice.deleteMany();
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
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

  it('stores shift photo evidence for open/close reports', async () => {
    const shift = await prisma.cashShift.create({
      data: { staffId: 'cashier-photo', point: 'BISHKEK-1', openCash: 0 },
    });

    const res = await evidence.attachImage(await pngBuffer(), {
      entityType: 'shift',
      entityId: shift.id,
      label: 'shift_close_photo',
      actor: 'cashier-photo',
    });

    expect(res.asset.key).toMatch(new RegExp(`^evidence/shift/${shift.id}/.+\\.webp$`));
    const event = await prisma.auditEvent.findFirst({ where: { type: 'evidence.attached' } });
    expect(event?.actor).toBe('cashier-photo');
    expect(event?.payload).toMatchObject({
      entityType: 'shift',
      entityId: shift.id,
      label: 'shift_close_photo',
    });
  });

  it('replays a keyed upload without duplicating the asset or ledger event', async () => {
    const mv = await movement();
    const image = await pngBuffer();
    const key = `evidence-replay-${Date.now()}-${seq}`;
    const first = await evidence.attachImage(image, {
      entityType: 'inventory',
      entityId: mv.id,
      label: 'shelf_photo',
      actor: 'warehouse',
    }, false, key);
    const replay = await evidence.attachImage(image, {
      entityType: 'inventory',
      entityId: mv.id,
      label: 'shelf_photo',
      actor: 'warehouse',
    }, false, key);

    expect(replay).toEqual(first);
    expect(await prisma.evidenceUpload.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'evidence.attached', refs: { has: mv.id } } })).toBe(1);
    await expect(evidence.attachImage(Buffer.from('different'), {
      entityType: 'inventory',
      entityId: mv.id,
      label: 'shelf_photo',
      actor: 'warehouse',
    }, false, key)).rejects.toMatchObject({ code: 'idempotency_key_reused' });
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

  it('binds customer evidence to an entity owned by that customer', async () => {
    const owner = await prisma.customer.create({
      data: { phone: `+996700EV${seq++}`, name: 'Evidence owner' },
    });
    const other = await prisma.customer.create({
      data: { phone: `+996701EV${seq++}`, name: 'Other evidence owner' },
    });
    const ticket = await prisma.supportTicket.create({
      data: {
        customerId: owner.id,
        channel: 'web',
        subject: 'Evidence ownership',
        priority: 'normal',
        sla: new Date(Date.now() + 60_000),
      },
    });

    await expect(evidence.assertCustomerOwnsEntity(owner.id, 'support', ticket.id)).resolves.toBeUndefined();
    await expect(evidence.assertCustomerOwnsEntity(other.id, 'support', ticket.id))
      .rejects.toMatchObject({ message: 'evidence_owner_mismatch' });
    await expect(evidence.assertCustomerOwnsEntity(owner.id, 'inventory', 'any'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
