"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicLlmClient = exports.DEFAULT_ANTHROPIC_MODEL = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
exports.DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOOL_ITERATIONS = 6;
class AnthropicLlmClient {
    constructor(opts) {
        this.supportsVision = true;
        this.supportsTools = true;
        this.supportsStructuredOutput = true;
        this.model = opts.model?.trim() || exports.DEFAULT_ANTHROPIC_MODEL;
        this.source = `anthropic:${this.model}`;
        this.client = new sdk_1.default({
            apiKey: opts.apiKey,
            timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxRetries: 2,
        });
    }
    async chat(messages, opts = {}) {
        const model = opts.model?.trim() || this.model;
        const source = `anthropic:${model}`;
        const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
        const system = opts.system ? buildSystem(opts.system, opts.cacheSystem) : undefined;
        const anthropicMessages = messages.map(toAnthropicMessage);
        if (opts.tools?.length) {
            const text = await this.runToolLoop({ model, maxTokens, system, tools: opts.tools }, anthropicMessages);
            return { text, source };
        }
        const params = {
            model,
            max_tokens: maxTokens,
            messages: anthropicMessages,
            ...(system ? { system } : {}),
            ...(opts.jsonSchema ? { output_config: { format: { type: 'json_schema', schema: opts.jsonSchema } } } : {}),
        };
        const res = await this.client.messages.create(params);
        const text = textOf(res);
        if (opts.jsonSchema) {
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                parsed = undefined;
            }
            return { text, parsed, source };
        }
        return { text, source };
    }
    async runToolLoop(base, initial) {
        const tools = base.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
        }));
        const messages = [...initial];
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
            const res = await this.client.messages.create({
                model: base.model,
                max_tokens: base.maxTokens,
                messages,
                tools,
                ...(base.system ? { system: base.system } : {}),
            });
            if (res.stop_reason !== 'tool_use')
                return textOf(res);
            messages.push({ role: 'assistant', content: res.content });
            const toolResults = [];
            for (const block of res.content) {
                if (block.type !== 'tool_use')
                    continue;
                const def = base.tools.find((t) => t.name === block.name);
                const result = await runTool(def, block.name, block.input);
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result.content, is_error: result.isError });
            }
            messages.push({ role: 'user', content: toolResults });
        }
        const finalRes = await this.client.messages.create({
            model: base.model,
            max_tokens: base.maxTokens,
            messages,
            ...(base.system ? { system: base.system } : {}),
        });
        return textOf(finalRes);
    }
}
exports.AnthropicLlmClient = AnthropicLlmClient;
async function runTool(def, name, input) {
    if (!def)
        return { content: `unknown tool: ${name}`, isError: true };
    try {
        return { content: await def.run(input), isError: false };
    }
    catch (err) {
        return { content: `tool «${name}» failed: ${String(err)}`, isError: true };
    }
}
function buildSystem(text, cache) {
    return [{ type: 'text', text, ...(cache ? { cache_control: { type: 'ephemeral' } } : {}) }];
}
function toAnthropicMessage(message) {
    return { role: message.role, content: toAnthropicContent(message.content) };
}
function toAnthropicContent(content) {
    if (typeof content === 'string')
        return content;
    return content.map((block) => block.type === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.dataBase64 } }
        : { type: 'text', text: block.text });
}
function textOf(res) {
    return res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
}
//# sourceMappingURL=anthropic-client.js.map