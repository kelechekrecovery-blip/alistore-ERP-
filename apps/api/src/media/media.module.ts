import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { LocalDiskStorage } from './storage/local-disk.storage';
import { S3Storage } from './storage/s3.storage';
import { MEDIA_STORAGE, MediaStorage } from './media-storage';
import { MediaCleanupService } from './media-cleanup.service';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

/**
 * Image ingestion: sharp compression → pluggable storage. S3/MinIO when
 * MEDIA_STORAGE=s3, else local disk (default). Storage swaps without touching
 * MediaService.
 */
@Module({
  // Upload is staff-only, so the controller's guards need staff auth,
  // the permission engine and the throttler wired in.
  imports: [StaffAuthModule, AuthzModule, RateLimitModule],
  providers: [
    MediaService,
    MediaCleanupService,
    {
      provide: MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MediaStorage =>
        config.get<string>('MEDIA_STORAGE') === 's3'
          ? new S3Storage(config)
          : new LocalDiskStorage(config),
    },
  ],
  controllers: [MediaController],
  exports: [MediaService, MediaCleanupService],
})
export class MediaModule {}
