import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({
  imports: [MediaModule, StaffAuthModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
