import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { StorefrontAdminController, StorefrontPublicController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [CatalogModule, StaffAuthModule, AuthzModule],
  controllers: [StorefrontPublicController, StorefrontAdminController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
