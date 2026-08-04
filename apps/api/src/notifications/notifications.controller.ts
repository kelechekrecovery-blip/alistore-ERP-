import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './push-token.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({
    summary: 'Register an Expo, APNs or FCM token for a native app',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Push token registered or refreshed.' })
  @Post('push-tokens')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  registerPushToken(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.notifications.registerPushToken(dto, user);
  }

  @ApiOperation({ summary: 'List durable notifications of the authenticated customer' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Customer-owned notification inbox.' })
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal, @Query('limit') limit?: string) {
    this.requireCustomer(user);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    return this.notifications.listMine(user.customerId, Number.isFinite(parsedLimit) ? parsedLimit : 50);
  }

  @ApiOperation({ summary: 'Mark one customer notification as read' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Customer-owned notification marked read.' })
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  markRead(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    this.requireCustomer(user);
    return this.notifications.markRead(id, user.customerId);
  }

  private requireCustomer(user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
  }
}
