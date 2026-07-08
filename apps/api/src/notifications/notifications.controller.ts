import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './push-token.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({
    summary: 'Register an Expo push token for the native mobile app',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Push token registered or refreshed.' })
  @Post('push-tokens')
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  registerPushToken(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user?: AuthPrincipal,
  ) {
    return this.notifications.registerPushToken(dto, user);
  }
}
