import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { PaymentIntentsService } from './payment-intents.service';
import { SandboxConfirmGuard } from './sandbox-confirm.guard';

@ApiExcludeController()
@Controller('sandbox/payments')
export class SandboxPaymentsController {
  constructor(private readonly intents: PaymentIntentsService) {}

  @Get(':provider/:intentId')
  page(
    @Param('provider') provider: string,
    @Param('intentId') intentId: string,
    @Query('returnUrl') returnUrl: string | undefined,
    @Res() response: Response,
  ) {
    response.type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AliStore Sandbox</title><style>body{font-family:system-ui;background:#16130f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.box{width:min(420px,88vw);border:1px solid #342e28;padding:28px;background:#221e19;border-radius:8px}button{width:100%;padding:14px;border:0;border-radius:7px;background:#c8f04b;color:#16130f;font-weight:800}.muted{color:#a79c92;font-size:14px}</style></head>
<body><main class="box"><h1>Тестовая оплата</h1><p class="muted">Провайдер: ${escapeHtml(provider)}<br>Intent: ${escapeHtml(intentId)}</p>
<form method="post" action="/api/sandbox/payments/${encodeURIComponent(provider)}/${encodeURIComponent(intentId)}/confirm">
<input type="hidden" name="returnUrl" value="${escapeHtml(returnUrl ?? '')}"><button type="submit">Подтвердить оплату</button></form>
<p class="muted">Списание средств не производится.</p></main></body></html>`);
  }

  @Post(':provider/:intentId/confirm')
  @UseGuards(SandboxConfirmGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async confirm(
    @Param('intentId') intentId: string,
    @Body() body: { returnUrl?: string },
    @Res() response: Response,
  ) {
    await this.intents.confirmSandboxIntent(intentId);
    const returnUrl = safeReturnUrl(body.returnUrl);
    if (returnUrl) return response.redirect(303, returnUrl);
    return response.type('html').send('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Оплачено</title><body><h1>Тестовая оплата подтверждена</h1><p>Вернитесь в AliStore.</p></body></html>');
  }
}

function safeReturnUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'alistore:' && url.hostname === 'payment-return' && !url.pathname) return value;
    if (url.protocol === 'https:' && ['ali.kg', 'www.ali.kg'].includes(url.hostname) && url.pathname === '/payment-return') return value;
  } catch {
    return null;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
