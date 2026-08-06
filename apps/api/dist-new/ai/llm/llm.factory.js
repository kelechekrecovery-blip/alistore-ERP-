"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLlmClient = resolveLlmClient;
exports.fastModel = fastModel;
const anthropic_client_1 = require("./anthropic-client");
const openrouter_client_1 = require("./openrouter-client");
const defaultEnv = (name) => process.env[name];
function read(env, name) {
    const value = env(name);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function resolveLlmClient(env = defaultEnv) {
    if (read(env, 'NODE_ENV') === 'test' &&
        read(env, 'AI_TEST_ALLOW_EXTERNAL') !== 'true' &&
        !read(env, 'AI_PROVIDER_KEY')) {
        return null;
    }
    const provider = (read(env, 'AI_PROVIDER') ?? 'auto').toLowerCase();
    const anthropicKey = read(env, 'ANTHROPIC_API_KEY');
    const openRouterKey = read(env, 'AI_PROVIDER_KEY') ?? read(env, 'OPENROUTER_API_KEY');
    const anthropic = () => anthropicKey ? new anthropic_client_1.AnthropicLlmClient({ apiKey: anthropicKey, model: read(env, 'ANTHROPIC_MODEL') }) : null;
    const openRouter = () => openRouterKey ? new openrouter_client_1.OpenRouterLlmClient({ apiKey: openRouterKey, model: read(env, 'AI_MODEL') }) : null;
    if (provider === 'anthropic')
        return anthropic();
    if (provider === 'openrouter')
        return openRouter();
    return anthropic() ?? openRouter();
}
function fastModel(env = defaultEnv) {
    return read(env, 'AI_FAST_MODEL');
}
//# sourceMappingURL=llm.factory.js.map