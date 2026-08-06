"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODERATION_SYSTEM = exports.MODERATION_SCHEMA = void 0;
exports.moderateByRules = moderateByRules;
exports.buildModerationMessages = buildModerationMessages;
exports.coerceModeration = coerceModeration;
const BANNED = [
    { category: 'profanity', terms: ['бляд', 'сука', 'хуй', 'пизд', 'ебан', 'мудак', 'fuck', 'shit', 'bitch'] },
    { category: 'spam', terms: ['casino', 'porn', 'viagra', 'заработок', 'crypto pump', 'http://', 'https://'] },
];
function moderateByRules(text) {
    const hay = text.toLowerCase();
    const categories = BANNED.filter((b) => b.terms.some((t) => hay.includes(t))).map((b) => b.category);
    return categories.length === 0
        ? { allowed: true, categories: [], reason: '', source: 'rules' }
        : { allowed: false, categories, reason: `Обнаружено: ${categories.join(', ')}`, source: 'rules' };
}
exports.MODERATION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        allowed: { type: 'boolean' },
        categories: {
            type: 'array',
            items: { type: 'string', enum: ['profanity', 'hate', 'harassment', 'spam', 'pii', 'sexual', 'violence', 'other'] },
        },
        reason: { type: 'string' },
    },
    required: ['allowed', 'categories', 'reason'],
};
exports.MODERATION_SYSTEM = [
    'Ты — модератор пользовательского контента магазина (отзывы, тексты витрины) на русском и английском.',
    'Определи, безопасно ли публиковать текст. Блокируй: мат/оскорбления, разжигание ненависти, домогательства,',
    'спам/реклама/ссылки, персональные данные (телефоны, адреса, номера карт), сексуальный или жестокий контент.',
    'Обычная критика товара/сервиса — разрешена. Верни allowed, categories и краткий reason (пусто, если allowed=true).',
].join(' ');
function buildModerationMessages(text) {
    return [{ role: 'user', content: `Текст для модерации:\n"""${text.slice(0, 4000)}"""` }];
}
function coerceModeration(parsed, source) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const raw = parsed;
    if (typeof raw.allowed !== 'boolean')
        return null;
    const categories = Array.isArray(raw.categories)
        ? raw.categories.filter((v) => typeof v === 'string').slice(0, 8)
        : [];
    const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : '';
    return { allowed: raw.allowed, categories, reason, source };
}
//# sourceMappingURL=moderation.js.map