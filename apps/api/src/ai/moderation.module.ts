import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';

/**
 * Standalone moderation module. `ModerationService` has no constructor dependencies (it
 * resolves the LLM provider directly), so it lives in its own lightweight module that
 * consumers — the `/ai/moderate` endpoint, product reviews, and the storefront CMS — can
 * import without pulling in the heavy `AiModule` graph (Reports/StaffAuth/Authz) and
 * risking a circular import. `StaffAuthModule`/`AuthzModule` back the `AiReadGuard` on the
 * public endpoint.
 */
@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [ModerationService],
  controllers: [ModerationController],
  exports: [ModerationService],
})
export class ModerationModule {}
