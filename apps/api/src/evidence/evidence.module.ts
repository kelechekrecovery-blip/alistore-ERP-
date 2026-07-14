import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [MediaModule, StaffAuthModule, AuthzModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
