import type { Response } from 'express';
import { SandboxPaymentsController } from '../src/payments/sandbox-payments.controller';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';

describe('Sandbox payment handoff', () => {
  const confirmSandboxIntent = jest.fn().mockResolvedValue({ idempotent: false });
  const controller = new SandboxPaymentsController({ confirmSandboxIntent } as unknown as PaymentIntentsService);

  beforeEach(() => jest.clearAllMocks());

  it('renders a no-charge confirmation form for a stored intent route', () => {
    const response = fakeResponse();
    controller.page('card<script>', 'PI-1', 'alistore://payment-return?orderId=o1', response.value);

    expect(response.type).toHaveBeenCalledWith('html');
    expect(response.body()).toContain('/api/sandbox/payments/card%3Cscript%3E/PI-1/confirm');
    expect(response.body()).toContain('Списание средств не производится');
    expect(response.body()).not.toContain('card<script>');
  });

  it('confirms the stored intent and redirects only to the native payment return', async () => {
    const response = fakeResponse();
    await controller.confirm('PI-1', { returnUrl: 'alistore://payment-return?orderId=o1' }, response.value);

    expect(confirmSandboxIntent).toHaveBeenCalledWith('PI-1');
    expect(response.redirect).toHaveBeenCalledWith(303, 'alistore://payment-return?orderId=o1');
  });

  it('does not act as an open redirect', async () => {
    const response = fakeResponse();
    await controller.confirm('PI-1', { returnUrl: 'https://attacker.example' }, response.value);

    expect(response.redirect).not.toHaveBeenCalled();
    expect(response.body()).toContain('Тестовая оплата подтверждена');
  });

  it('accepts the production HTTPS payment return host', async () => {
    const response = fakeResponse();
    await controller.confirm('PI-1', { returnUrl: 'https://alistore.kg/payment-return?orderId=o1' }, response.value);
    expect(response.redirect).toHaveBeenCalledWith(303, 'https://alistore.kg/payment-return?orderId=o1');

    const rejected = fakeResponse();
    await controller.confirm('PI-1', { returnUrl: 'https://alistore.kg.evil/payment-return?orderId=o1' }, rejected.value);
    expect(rejected.redirect).not.toHaveBeenCalled();
  });
});

function fakeResponse() {
  let sent = '';
  const type = jest.fn().mockReturnThis();
  const send = jest.fn((value: string) => { sent = value; return value; });
  const redirect = jest.fn();
  return {
    value: { type, send, redirect } as unknown as Response,
    type,
    redirect,
    body: () => sent,
  };
}
