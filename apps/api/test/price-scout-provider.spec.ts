const resolveLlmClientMock = jest.fn();

jest.mock('../src/ai/llm/llm.factory', () => ({
  resolveLlmClient: () => resolveLlmClientMock(),
  fastModel: () => undefined,
}));

import { PriceScoutService } from '../src/ai/price-scout.service';

const fakeClient = (json: string) => ({
  source: 'anthropic:test',
  supportsVision: true,
  supportsTools: true,
  supportsStructuredOutput: true,
  chat: jest.fn().mockResolvedValue({ text: json, parsed: JSON.parse(json || '{}'), source: 'anthropic:test' }),
});

const inline = { name: 'iPhone 15', basePrice: 100000, observedListings: [] };

describe('PriceScoutService LLM port', () => {
  beforeEach(() => resolveLlmClientMock.mockReset());

  it('routes through the configured LLM client and returns its source + parsed numbers', async () => {
    const client = fakeClient(
      '{"marketLow":90000,"marketMedian":100000,"marketHigh":110000,"recommendedPrice":98000,"confidence":0.7,"signals":["s"],"notes":["n"]}',
    );
    resolveLlmClientMock.mockReturnValue(client);

    const result = await new PriceScoutService({} as never).scout(inline);

    expect(client.chat).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('anthropic:test');
    expect(result.recommendedPrice).toBe(98000);
    expect(result.marketMedian).toBe(100000);
  });

  it('uses keyless rules when no provider is configured', async () => {
    resolveLlmClientMock.mockReturnValue(null);
    const result = await new PriceScoutService({} as never).scout(inline);
    expect(result.source).toBe('rules');
  });

  it('falls back to rules when the client throws', async () => {
    const client = fakeClient('{}');
    client.chat = jest.fn().mockRejectedValue(new Error('boom'));
    resolveLlmClientMock.mockReturnValue(client);
    const result = await new PriceScoutService({} as never).scout(inline);
    expect(result.source).toBe('rules (fallback)');
  });
});
