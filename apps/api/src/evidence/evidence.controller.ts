import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ValidationError } from '../common/errors';
import { EvidenceImageDto } from './evidence.dto';
import { EvidenceService } from './evidence.service';
import { requireGuestCapability } from '../auth/guest-capability';
import { StaffAuthService } from '../staff-auth/staff-auth.service';

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService, private readonly staffAuth: StaffAuthService) {}

  @ApiOperation({ summary: 'Issue a short-lived authorized read URL for an Evidence Vault image' })
  @Get('images/:idempotencyKey')
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async readImage(
    @Param('idempotencyKey') idempotencyKey: string,
    @CurrentUser() user?: AuthPrincipal,
    @Headers('x-guest-capability') capability?: string,
  ) {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) throw new BadRequestException('Некорректный Evidence idempotency key');
    const upload = await this.evidence.findUpload(key);
    let actor: string;
    if (user?.typ === 'staff') {
      const staff = await this.staffAuth.me(user.customerId);
      await this.evidence.assertStaffCanRead(user.role ?? '');
      if (upload.entityType === 'shift') {
        await this.evidence.assertStaffCanAttachShift(
          user.customerId,
          staff.role,
          upload.entityId,
        );
      }
      if (upload.entityType === 'order') {
        await this.evidence.assertStaffCanAttachOrder(user.customerId, staff.role, upload.entityId);
      }
      actor = `staff:${user.customerId}`;
    } else {
      const customerId = user?.typ === 'customer'
        ? user.customerId
        : requireGuestCapability(capability, 'evidence:read').sub;
      await this.evidence.assertCustomerOwnsEntity(customerId, upload.entityType as EvidenceImageDto['entityType'], upload.entityId);
      actor = user?.customerId ? `customer:${user.customerId}` : `guest:${customerId}`;
    }
    return this.evidence.issueRead(key, actor);
  }

  @ApiOperation({ summary: 'Attach an image evidence file to a domain entity' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'entityType', 'entityId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string', enum: ['tradein', 'return', 'warranty', 'inventory', 'order', 'support', 'shift', 'loaner', 'quarantine', 'exchange'] },
        entityId: { type: 'string' },
        label: { type: 'string' },
        actor: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Image compressed, stored, and linked in Event Ledger.' })
  @ApiUnprocessableEntityResponse({ description: 'No file, bad image, or unknown entity.' })
  @Post('images')
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // storage-abuse / cost DoS guard
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: EvidenceImageDto,
    @CurrentUser() user?: AuthPrincipal,
    @Headers('x-guest-capability') capability?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key) throw new BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    const custodyEvidence = dto.entityType === 'loaner' && ['loaner_issue', 'loaner_return'].includes(dto.label?.trim() ?? '');
    const quarantineEvidence = dto.entityType === 'quarantine' && dto.label?.trim() === 'quarantine_diagnosis';
    const exchangeEvidence = dto.entityType === 'exchange' && dto.label?.trim() === 'exchange_condition';
    const trustedStaffEvidence = custodyEvidence || quarantineEvidence || exchangeEvidence;
    let guestCustomerId: string | undefined;
    if (user?.typ === 'staff') {
      const staff = await this.staffAuth.me(user.customerId);
      if (dto.entityType === 'shift') {
        await this.evidence.assertStaffCanAttachShift(user.customerId, staff.role, dto.entityId);
      }
      if (dto.entityType === 'order') {
        await this.evidence.assertStaffCanAttachOrder(user.customerId, staff.role, dto.entityId);
      }
      if (custodyEvidence) await this.evidence.assertStaffCanAttachLoanerCustody(user.customerId, dto.entityId);
      if (exchangeEvidence) await this.evidence.assertStaffCanAttachExchange(user.customerId, dto.entityId);
    } else {
      if (custodyEvidence || exchangeEvidence) throw new ForbiddenException('staff_evidence_only');
      guestCustomerId = user?.typ === 'customer'
        ? undefined
        : requireGuestCapability(capability, 'evidence:write').sub;
      const customerId = user?.customerId ?? guestCustomerId!;
      await this.evidence.assertCustomerOwnsEntity(customerId, dto.entityType, dto.entityId);
    }
    const actor = user?.typ === 'staff' ? `staff:${user.customerId}` : user?.customerId ?? guestCustomerId!;
    return this.evidence.attachImage(file.buffer, { ...dto, actor }, trustedStaffEvidence && user?.typ === 'staff', key);
  }
}
