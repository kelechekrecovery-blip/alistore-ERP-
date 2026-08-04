import { Body, Controller, ForbiddenException, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { IngestCameraEventDto, RegisterEdgeDeviceDto } from './camera-gateway.dto';
import { CameraGatewayService } from './camera-gateway.service';

@ApiTags('camera-gateway')
@Controller('camera-gateway')
export class CameraGatewayController {
  constructor(private readonly gateway: CameraGatewayService) {}

  @Post('devices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard)
  register(@Body() dto: RegisterEdgeDeviceDto, @CurrentUser() user: AuthPrincipal) {
    if (user.role !== 'owner' && user.role !== 'admin') throw new ForbiddenException('Только owner/admin могут регистрировать edge-устройства');
    return this.gateway.register(dto, user.customerId);
  }

  /** Edge-only endpoint: one-time device secret is sent as a header, never in a URL or event payload. */
  @Post('events')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  ingest(@Body() dto: IngestCameraEventDto, @Headers('x-edge-device-secret') secret?: string) {
    return this.gateway.ingest(dto, secret ?? '');
  }
}
