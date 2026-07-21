import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OtpRetentionService } from './otp-retention.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './jwt.strategy';
import { resolveJwtSecret } from './jwt-secret';
import { AuthController } from './auth.controller';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { OTP_SENDER, OtpSender } from './otp-sender';
import { selectOtpSender } from './otp-sender-selector';

/**
 * Phone+OTP authentication. AuditService and PrismaService are provided globally;
 * JWT signing/verification is configured from JWT_SECRET / JWT_ACCESS_TTL.
 */
@Module({
  imports: [
    PassportModule,
    // Rate-limit auth endpoints (anti OTP/SMS abuse); per-route caps in the controller.
    RateLimitModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Access-token TTL is applied per-sign in AuthService (a literal that
      // satisfies the strict `ms` StringValue type); the module only needs the key.
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
      }),
    }),
  ],
  providers: [
    AuthService,
    TotpService,
    JwtStrategy,
    OptionalJwtAuthGuard,
    // Без него телефоны в `OtpChallenge` копятся бессрочно: удаление аккаунта
    // чистит только свой номер, а большинство challenge аккаунтом не становятся.
    OtpRetentionService,
    {
      provide: OTP_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): OtpSender =>
        selectOtpSender((name) => config.get<string>(name)),
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, TotpService, OptionalJwtAuthGuard],
})
export class AuthModule {}
