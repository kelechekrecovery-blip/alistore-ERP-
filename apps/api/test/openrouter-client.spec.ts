import { OpenRouterLlmClient } from '../src/ai/llm/openrouter-client';

const okResponse = (content: string) =>
  ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }) as unknown as Response;

describe('OpenRouterLlmClient (OpenAI-compatible full port)', () => {
  const oldFetch = global.fetch;
  afterEach(() => {
    global.fetch = oldFetch;
  });

  it('advertises vision + structured output (tool loop stays off)', () => {
    const client = new OpenRouterLlmClient({ apiKey: 'or' });
    expect(client.source).toBe('openrouter:openai/gpt-4o-mini');
    expect(client.supportsVision).toBe(true);
    expect(client.supportsStructuredOutput).toBe(true);
    expect(client.supportsTools).toBe(false);
  });

  it('does not advertise optional capabilities for an unknown model', () => {
    const client = new OpenRouterLlmClient({ apiKey: 'or', model: 'vendor/text-model' });
    expect(client.supportsVision).toBe(false);
    expect(client.supportsStructuredOutput).toBe(false);
  });

  it('sends the system prompt and multimodal image_url content blocks', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('ok'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new OpenRouterLlmClient({ apiKey: 'or' });

    await client.chat(
      [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', mediaType: 'image/jpeg', dataBase64: 'AAA' }] }],
      { system: 'SYS', maxTokens: 500 },
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1].content[0]).toEqual({ type: 'text', text: 'look' });
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } });
    expect(body.max_tokens).toBe(500);
  });

  it('passes a JSON schema via response_format and returns the parsed object', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('{"grade":"B"}'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new OpenRouterLlmClient({ apiKey: 'or', model: 'x/y' });

    const schema = { type: 'object', additionalProperties: false, properties: { grade: { type: 'string' } }, required: ['grade'] };
    const res = await client.chat([{ role: 'user', content: 'grade it' }], { jsonSchema: schema });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'result', strict: true, schema } });
    expect(res.parsed).toEqual({ grade: 'B' });
    expect(res.source).toBe('openrouter:x/y');
  });

  it('throws on a non-200 so callers fall back to rules', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 } as unknown as Response) as unknown as typeof fetch;
    const client = new OpenRouterLlmClient({ apiKey: 'or' });
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('429');
  });

  it('retries without response_format when a model rejects json_schema', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 400 } as unknown as Response)
      .mockResolvedValueOnce(okResponse('{"grade":"B"}'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new OpenRouterLlmClient({ apiKey: 'or' });

    const result = await client.chat([{ role: 'user', content: 'grade' }], {
      jsonSchema: { type: 'object' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
    expect(result.parsed).toEqual({ grade: 'B' });
  });

  it('rejects tools without making a provider request', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new OpenRouterLlmClient({ apiKey: 'or' });

    await expect(client.chat([{ role: 'user', content: 'hi' }], {
      tools: [{
        name: 'lookup',
        description: 'lookup',
        inputSchema: { type: 'object' },
        run: async () => 'ok',
      }],
    })).rejects.toThrow('does not support');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
