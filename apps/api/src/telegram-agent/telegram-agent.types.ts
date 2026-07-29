export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export function parseTelegramUpdate(value: unknown): TelegramUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const update = value as Partial<TelegramUpdate>;
  if (!Number.isSafeInteger(update.update_id)) return null;
  if (!update.message) return { update_id: update.update_id as number };
  const message = update.message as Partial<TelegramMessage>;
  if (!Number.isSafeInteger(message.message_id) || !message.chat || typeof message.chat !== 'object') {
    return null;
  }
  const chat = message.chat as Partial<TelegramChat>;
  if (!Number.isSafeInteger(chat.id) || !['private', 'group', 'supergroup', 'channel'].includes(String(chat.type))) {
    return null;
  }
  if (message.from && (!Number.isSafeInteger(message.from.id) || message.from.is_bot)) return null;
  return update as TelegramUpdate;
}

export function telegramDisplayName(user: TelegramUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || (user.username ? `@${user.username}` : `Telegram ${user.id}`);
}
