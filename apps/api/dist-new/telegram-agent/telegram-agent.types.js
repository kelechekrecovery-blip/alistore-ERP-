"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTelegramUpdate = parseTelegramUpdate;
exports.telegramDisplayName = telegramDisplayName;
function parseTelegramUpdate(value) {
    if (!value || typeof value !== 'object')
        return null;
    const update = value;
    if (!Number.isSafeInteger(update.update_id))
        return null;
    if (!update.message)
        return { update_id: update.update_id };
    const message = update.message;
    if (!Number.isSafeInteger(message.message_id) || !message.chat || typeof message.chat !== 'object') {
        return null;
    }
    const chat = message.chat;
    if (!Number.isSafeInteger(chat.id) || !['private', 'group', 'supergroup', 'channel'].includes(String(chat.type))) {
        return null;
    }
    if (message.from && (!Number.isSafeInteger(message.from.id) || message.from.is_bot))
        return null;
    return update;
}
function telegramDisplayName(user) {
    const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return full || (user.username ? `@${user.username}` : `Telegram ${user.id}`);
}
//# sourceMappingURL=telegram-agent.types.js.map