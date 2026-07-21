import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthController } from './staff-auth.controller';
import { resolveJwtSecret } from '../auth/jwt-secret';
import { AuthzModule } from '../authz/authz.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { BlindCashReadGuard } from '../auth/blind-cash-read.guard';

/**
 * Staff auth. Signs with the same JWT_SECRET as customer auth, so the shared
 * JwtStrategy validates staff tokens too — and now carries the role for authz.
 */
@Module({
  imports: [
    AuthzModule,
    AuthModule,
    AuditModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
      }),
    }),
  ],
  providers: [StaffAuthService, ActiveStaffGuard, BlindCashReadGuard],
  controllers: [StaffAuthController],
  exports: [StaffAuthService, ActiveStaffGuard, BlindCashReadGuard],
})
export class StaffAuthModule {}
