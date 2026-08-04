import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { ValidationError } from '../common/errors';

/** Same ceiling as the Evidence Vault — keeps storage cost and request size bounded. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Upload an image (multipart field `file`) → compressed WebP; returns key+url.
   * Staff-only: this feeds product and storefront imagery, so it carries the same
   * size cap and rate limit as evidence uploads instead of being reachable by any
   * authenticated customer.
   */
  @Post()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard, ThrottlerGuard)
  @RequirePermission('media', 'upload')
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // storage-abuse / cost DoS guard
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    return this.media.ingestImage(file.buffer);
  }
}
