import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { resolveJwtSecret } from '../auth/jwt-secret';
import { BusinessAuthService } from './business-auth.service';
import { BusinessProductsService } from './business-products.service';
import { BusinessAuthGuard } from './business-auth.guard';
import { BusinessController } from './business.controller';
import { SellersService } from '../sellers/sellers.service';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthzModule,
    StaffAuthModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: resolveJwtSecret(config) }),
    }),
  ],
  controllers: [BusinessController],
  providers: [BusinessAuthService, BusinessProductsService, BusinessAuthGuard, SellersService],
  exports: [BusinessAuthService, SellersService],
})
export class BusinessModule {}
