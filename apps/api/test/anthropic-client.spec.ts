const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ messages: { create: createMock } })),
}));

import { AnthropicLlmClient } from '../src/ai/llm/anthropic-client';
import type { LlmToolDef } from '../src/ai/llm/llm-client';

const textMsg = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

describe('AnthropicLlmClient', () => {
  beforeEach(() => createMock.mockReset());

  it('reports vision, tools and structured-output capabilities and a model-tagged source', () => {
    const client = new AnthropicLlmClient({ apiKey: 'sk', model: 'claude-opus-4-8' });
    expect(client.source).toBe('anthropic:claude-opus-4-8');
    expect(client.supportsVision).toBe(true);
    expect(client.supportsTools).toBe(true);
    expect(client.supportsStructuredOutput).toBe(true);
  });

  it('caches the system prefix and sends image content blocks', async () => {
    createMock.mockResolvedValueOnce(textMsg('ok'));
    const client = new AnthropicLlmClient({ apiKey: 'sk' });
    await client.chat(
      [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', mediaType: 'image/jpeg', dataBase64: 'AAA' }] }],
      { system: 'PERSONA', cacheSystem: true, maxTokens: 500 },
    );

    const params = createMock.mock.calls[0][0];
    expect(params.system).toEqual([{ type: 'text', text: 'PERSONA', cache_control: { type: 'ephemeral' } }]);
    expect(params.max_tokens).toBe(500);
    const content = params.messages[0].content;
    expect(content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } });
  });

  it('passes a JSON schema via output_config and parses the reply', async () => {
    createMock.mockResolvedValueOnce(textMsg('{"grade":"B","confidence":0.7}'));
    const client = new AnthropicLlmClient({ apiKey: 'sk' });
    const schema = { type: 'object', properties: { grade: { type: 'string' } } };
    const res = await client.chat([{ role: 'user', content: 'grade it' }], { jsonSchema: schema });

    expect(createMock.mock.calls[0][0].output_config).toEqual({ format: { type: 'json_schema', schema } });
    expect(res.parsed).toEqual({ grade: 'B', confidence: 0.7 });
    expect(res.source).toBe('anthropic:claude-opus-4-8');
  });

  it('runs the agentic tool loop: executes the tool then returns the final answer', async () => {
    createMock
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't1', name: 'get_kpi', input: {} }], stop_reason: 'tool_use' })
      .mockResolvedValueOnce(textMsg('done'));

    const run = jest.fn().mockResolvedValue('kpi-json');
    const tools: LlmToolDef[] = [{ name: 'get_kpi', description: 'kpi', inputSchema: { type: 'object', properties: {} }, run }];

    const client = new AnthropicLlmClient({ apiKey: 'sk' });
    const res = await client.chat([{ role: 'user', content: 'analyze' }], { tools });

    expect(run).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(2);
    // Second call must carry the assistant tool_use turn + the user tool_result.
    const secondMessages = createMock.mock.calls[1][0].messages;
    const toolResult = secondMessages[secondMessages.length - 1].content[0];
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: 'kpi-json', is_error: false });
    expect(res.text).toBe('done');
  });

  it('reports a failing tool back to the model without throwing', async () => {
    createMock
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't1', name: 'boom', input: {} }], stop_reason: 'tool_use' })
      .mockResolvedValueOnce(textMsg('recovered'));
    const tools: LlmToolDef[] = [
      { name: 'boom', description: 'x', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new Error('nope'); } },
    ];
    const client = new AnthropicLlmClient({ apiKey: 'sk' });
    const res = await client.chat([{ role: 'user', content: 'go' }], { tools });

    const toolResult = createMock.mock.calls[1][0].messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
    expect(res.text).toBe('recovered');
  });
});
