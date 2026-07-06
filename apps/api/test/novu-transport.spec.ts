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
      .mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new NovuHttpTransport(config);
    await transport.deliver({
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
    const body = JSON.parse(options.body);
    expect(body.name).toBe('reservation_expired');
    expect(body.to.subscriberId).toBe('+996700000000');
    expect(body.payload.orderId).toBe('o1');
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
});
