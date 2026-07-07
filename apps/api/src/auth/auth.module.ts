import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './jwt.strategy';
import { resolveJwtSecret } from './jwt-secret';
import { AuthController } from './auth.controller';

/**
 * Phone+OTP authentication. AuditService and PrismaService are provided globally;
 * JWT signing/verification is configured from JWT_SECRET / JWT_ACCESS_TTL.
 */
@Module({
  imports: [
    PassportModule,
    // Rate-limit auth endpoints (anti OTP/SMS abuse); per-route caps in the controller.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Access-token TTL is applied per-sign in AuthService (a literal that
      // satisfies the strict `ms` StringValue type); the module only needs the key.
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
      }),
    }),
  ],
  providers: [AuthService, TotpService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, TotpService],
})
export class AuthModule {}
