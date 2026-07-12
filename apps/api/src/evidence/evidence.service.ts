import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { MediaService, type IngestedImage } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceEntityType, EvidenceImageDto } from './evidence.dto';
import { ForbiddenException } from '@nestjs/common';

export interface EvidenceAttachment {
  entityType: EvidenceEntityType;
  entityId: string;
  asset: IngestedImage;
  label: string | null;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async attachImage(input: Buffer, dto: EvidenceImageDto): Promise<EvidenceAttachment> {
    await this.assertEntityExists(dto.entityType, dto.entityId);
    const label = dto.label?.trim() || null;
    const asset = await this.media.ingestImage(
      input,
      `evidence/${dto.entityType}/${dto.entityId}`,
    );

    return this.audit.transaction(async () => ({
      result: { entityType: dto.entityType, entityId: dto.entityId, asset, label },
      events: [
        {
          type: EventType.EvidenceAttached,
          actor: dto.actor ?? 'system',
          payload: {
            entityType: dto.entityType,
            entityId: dto.entityId,
            label,
            asset,
          },
          refs: [dto.entityId, asset.key],
        },
      ],
    }));
  }

  async assertCustomerOwnsEntity(customerId: string, type: EvidenceEntityType, id: string): Promise<void> {
    let ownerId: string | null = null;
    switch (type) {
      case 'tradein':
        ownerId = (await this.prisma.tradeInDevice.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
        break;
      case 'warranty':
        ownerId = (await this.prisma.warrantyCase.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
        break;
      case 'support':
        ownerId = (await this.prisma.supportTicket.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
        break;
      case 'order':
        ownerId = (await this.prisma.order.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
        break;
      case 'return': {
        const item = await this.prisma.return.findUnique({ where: { id }, select: { orderId: true } });
        ownerId = item
          ? (await this.prisma.order.findUnique({ where: { id: item.orderId }, select: { customerId: true } }))?.customerId ?? null
          : null;
        break;
      }
      case 'inventory':
      case 'shift':
        throw new ForbiddenException('evidence_staff_only_entity');
    }
    if (!ownerId) throw new ValidationError('evidence_entity_not_found', `${type} ${id} не найден`);
    if (ownerId !== customerId) throw new ForbiddenException('evidence_owner_mismatch');
  }

  private async assertEntityExists(type: EvidenceEntityType, id: string) {
    const found = await this.lookup(type, id);
    if (!found) {
      throw new ValidationError('evidence_entity_not_found', `${type} ${id} не найден`);
    }
  }

  private lookup(type: EvidenceEntityType, id: string): Promise<unknown> {
    switch (type) {
      case 'tradein':
        return this.prisma.tradeInDevice.findUnique({ where: { id } });
      case 'return':
        return this.prisma.return.findUnique({ where: { id } });
      case 'warranty':
        return this.prisma.warrantyCase.findUnique({ where: { id } });
      case 'inventory':
        return this.prisma.inventoryMovement.findUnique({ where: { id } });
      case 'order':
        return this.prisma.order.findUnique({ where: { id } });
      case 'support':
        return this.prisma.supportTicket.findUnique({ where: { id } });
      case 'shift':
        return this.prisma.cashShift.findUnique({ where: { id } });
    }
  }
}
