import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { TelegramAgentService } from './telegram-agent.service';
import { TelegramAgentStepUpDto } from './telegram-agent.dto';

@ApiTags('telegram-agent')
@Controller('telegram-agent')
export class TelegramAgentController {
  constructor(private readonly agent: TelegramAgentService) {}

  @Post('pairing-code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a one-time Telegram pairing code for the current admin/owner' })
  @ApiCreatedResponse({ description: 'One-time code, valid for ten minutes.' })
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('telegram_agent', 'link')
  createPairing(@CurrentUser() user: AuthPrincipal, @Body() dto: TelegramAgentStepUpDto) {
    if (user.typ !== 'staff') throw new ForbiddenException('Требуется staff JWT');
    return this.agent.createPairing(user.customerId, dto.totpToken);
  }

  @Delete('link')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable the current staff Telegram link' })
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('telegram_agent', 'link')
  disconnect(@CurrentUser() user: AuthPrincipal, @Body() dto: TelegramAgentStepUpDto) {
    if (user.typ !== 'staff') throw new ForbiddenException('Требуется staff JWT');
    return this.agent.disconnect(user.customerId, dto.totpToken);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Telegram Bot API webhook (secret-token protected)' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: unknown,
  ) {
    return this.agent.handleWebhook(secret, update);
  }
}
