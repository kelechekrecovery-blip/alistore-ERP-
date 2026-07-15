import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ModerationModule } from '../ai/moderation.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { StorefrontBlocksAdminController, StorefrontBlocksPublicController } from './storefront-blocks.controller';
import { StorefrontBlocksService } from './storefront-blocks.service';

@Module({
  imports: [CatalogModule, StaffAuthModule, AuthzModule, ModerationModule],
  controllers: [StorefrontBlocksPublicController, StorefrontBlocksAdminController],
  providers: [StorefrontBlocksService],
})
export class StorefrontBlocksModule {}
