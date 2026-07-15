import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { StorefrontAdminController, StorefrontPublicController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [StorefrontPublicController, StorefrontAdminController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
