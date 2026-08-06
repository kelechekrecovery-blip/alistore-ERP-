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
export declare function parseTelegramUpdate(value: unknown): TelegramUpdate | null;
export declare function telegramDisplayName(user: TelegramUser): string;
