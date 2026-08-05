import { ConfigService } from '@nestjs/config';
import { NovuHttpTransport } from '../src/outbox/transports/novu.transport';

/** NovuHttpTransport (pure, global fetch mocked). */
describe('NovuHttpTransport', () => {
  const config = {
    get: (key: string) =>
      (
        { NOVU_API_URL: 'https://novu.test', NOVU_API_KEY: 'secret-key' } as Record<
          string,
          string
        >
      )[key],
  } as unknown as ConfigService;

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs a trigger to Novu with the api key and mapped message', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ acknowledged: true, status: 'processed' }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new NovuHttpTransport(config);
    await transport.deliver({
      idempotencyKey: 'outbox-message-1',
      channel: 'sms',
      recipient: '+996700000000',
      template: 'reservation_expired',
      payload: { orderId: 'o1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://novu.test/v1/events/trigger');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('ApiKey secret-key');
    expect(options.headers['idempotency-key']).toBe('outbox-message-1');
    const body = JSON.parse(options.body);
    expect(body.name).toBe('reservation_expired');
    expect(body.to.subscriberId).toBe('+996700000000');
    expect(body.payload.orderId).toBe('o1');
    expect(body.transactionId).toBe('outbox-message-1');
  });

  it('throws on a non-2xx response so the outbox retries', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;

    const transport = new NovuHttpTransport(config);
    await expect(
      transport.deliver({
        channel: 'sms',
        recipient: '+996700000000',
        template: 'x',
        payload: {},
      }),
    ).rejects.toThrow(/Novu trigger failed: 500/);
  });

  it('rejects a terminal logical failure returned with HTTP 201', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        acknowledged: false,
        status: 'invalid_recipients',
      }),
    }) as unknown as typeof fetch;
    const transport = new NovuHttpTransport(config);

    await expect(transport.deliver({
      idempotencyKey: 'outbox-terminal-1',
      channel: 'sms',
      recipient: 'invalid',
      template: 'x',
      payload: {},
    })).rejects.toMatchObject({
      message: 'Novu trigger rejected: invalid_recipients',
      retryable: false,
    });
  });

  it('classifies a provider-side logical error as retryable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ acknowledged: false, status: 'error' }),
    }) as unknown as typeof fetch;
    const transport = new NovuHttpTransport(config);

    await expect(transport.deliver({
      channel: 'sms',
      recipient: '+996700000000',
      template: 'x',
      payload: {},
    })).rejects.toMatchObject({ retryable: true });
  });
});
