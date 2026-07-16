import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { MediaService, type IngestedImage } from '../media/media.service';
import { MediaCleanupService } from '../media/media-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceEntityType, EvidenceImageDto } from './evidence.dto';
import { ForbiddenException } from '@nestjs/common';
import { AuthzService } from '../authz/authz.service';

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
    private readonly authz: AuthzService,
    private readonly mediaCleanup: MediaCleanupService,
  ) {}

  async attachImage(input: Buffer, dto: EvidenceImageDto, trustedStaffEvidence = false): Promise<EvidenceAttachment> {
    await this.assertEntityExists(dto.entityType, dto.entityId);
    const label = dto.label?.trim() || null;
    const prefix = `evidence/${dto.entityType}/${dto.entityId}`;
    const prepared = await this.media.prepareImage(input);
    const objectKey = this.media.createImageKey(prefix);
    await this.mediaCleanup.registerIntent(objectKey);
    const asset = await this.media.storePreparedImage(
      prepared,
      prefix,
      objectKey,
    );

    try {
      return await this.audit.transaction(async (tx) => {
        if (trustedStaffEvidence && dto.entityType === 'exchange') {
          await tx.$queryRaw`SELECT id FROM "ExchangeRequest" WHERE id = ${dto.entityId} FOR UPDATE`;
          const request = await tx.exchangeRequest.findUnique({
            where: { id: dto.entityId },
            select: { requester: true, status: true, expiresAt: true },
          });
          if (!request
            || request.status !== 'requested'
            || request.expiresAt <= new Date()
            || dto.actor !== `staff:${request.requester}`) {
            throw new ForbiddenException('exchange_evidence_request_changed');
          }
        }
        await this.mediaCleanup.markRetainedOnTx(tx, asset.key);
        return {
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
                trustedStaffEvidence,
              },
              refs: [dto.entityId, asset.key],
            },
          ],
        };
      });
    } catch (error) {
      await this.mediaCleanup.deleteOrSchedule(asset.key);
      throw error;
    }
  }

  async assertStaffCanAttachLoanerCustody(staffId: string, loanId: string): Promise<void> {
    const [staff, loan] = await Promise.all([
      this.prisma.staffUser.findUnique({ where: { id: staffId }, select: { active: true, role: true, point: true } }),
      this.prisma.loanerLoan.findUnique({ where: { id: loanId }, select: { workOrder: { select: { point: true } } } }),
    ]);
    if (!staff?.active || !(await this.authz.can(staff.role, 'service_center', 'loaners_issue'))) {
      throw new ForbiddenException('loaner_evidence_permission_denied');
    }
    if (!loan) throw new ValidationError('evidence_entity_not_found', `loaner ${loanId} не найден`);
    if (!['admin', 'owner'].includes(staff.role) && staff.point !== loan.workOrder.point) {
      throw new ForbiddenException('loaner_evidence_point_mismatch');
    }
  }

  async assertStaffCanAttachExchange(staffId: string, exchangeRequestId: string): Promise<void> {
    const request = await this.prisma.exchangeRequest.findUnique({
      where: { id: exchangeRequestId },
      select: { requester: true, status: true, expiresAt: true },
    });
    if (!request) {
      throw new ValidationError('evidence_entity_not_found', `exchange ${exchangeRequestId} не найден`);
    }
    if (request.status !== 'requested' || request.expiresAt <= new Date()) {
      throw new ForbiddenException('exchange_evidence_request_resolved');
    }
    if (request.requester !== staffId) {
      throw new ForbiddenException('exchange_evidence_requester_mismatch');
    }
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
      case 'loaner':
        ownerId = (await this.prisma.loanerLoan.findUnique({ where: { id }, select: { customerId: true } }))?.customerId ?? null;
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
      case 'quarantine':
      case 'exchange':
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
      case 'loaner':
        return this.prisma.loanerLoan.findUnique({ where: { id } });
      case 'quarantine':
        return this.prisma.inventoryQuarantineCase.findUnique({ where: { id } });
      case 'exchange':
        return this.prisma.exchangeRequest.findUnique({ where: { id } });
    }
  }
}
