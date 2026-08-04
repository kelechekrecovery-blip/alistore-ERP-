import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GiftcardsService } from './giftcards.service';
import { IssueGiftCardDto } from './giftcards.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('giftcards')
@Controller('giftcards')
export class GiftcardsController {
  constructor(private readonly giftcards: GiftcardsService) {}

  @ApiOperation({ summary: 'Issue a gift card / store-credit balance' })
  @ApiCreatedResponse({ description: 'Gift card issued and ledger event written.' })
  @ApiConflictResponse({ description: 'Code already exists.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('giftcards', 'issue')
  @Post()
  issue(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: IssueGiftCardDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.giftcards.issue(dto, user.customerId, requireIdempotencyKey(idempotencyKey));
  }

  @ApiOperation({ summary: 'Check gift-card balance by code' })
  @ApiOkResponse({ description: 'Gift card balance and redeemable status.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown gift-card code.' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':code')
  get(@Param('code') code: string) {
    return this.giftcards.getByCode(code);
  }
}

/**
 * Ключ обязателен, как на возвратах: выпуск карты создаёт деньги, и повтор без
 * ключа отличить от новой операции невозможно.
 */
function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
