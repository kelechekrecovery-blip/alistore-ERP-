import { INFORMATIONAL_FISCAL_PROVIDER } from '../src/fiscal/fiscal-provider';

describe('informational fiscal provider', () => {
  it('fails closed without inventing a fiscal number or QR payload', async () => {
    await expect(INFORMATIONAL_FISCAL_PROVIDER.issue({
      orderId: 'order-demo',
      total: 1000,
      operation: 'sale',
    })).resolves.toEqual({
      status: 'informational',
      fiscalNumber: null,
      qrPayload: null,
      providerReference: null,
    });
    expect(INFORMATIONAL_FISCAL_PROVIDER.certified).toBe(false);
  });
});
