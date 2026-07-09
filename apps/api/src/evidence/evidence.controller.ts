import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @ApiOperation({ summary: 'Attach an image evidence file to a domain entity' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'entityType', 'entityId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string', enum: ['tradein', 'return', 'warranty', 'inventory', 'order', 'support', 'shift'] },
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
  uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: EvidenceImageDto,
    @CurrentUser() user?: AuthPrincipal,
  ) {
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    // Never trust the body's `actor` — it lands in the append-only ledger. Derive it from
    // the token when present (staff/customer), else 'guest'.
    const actor = user ? (user.typ === 'staff' ? `staff:${user.customerId}` : user.customerId) : 'guest';
    return this.evidence.attachImage(file.buffer, { ...dto, actor });
  }
}
