"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectNotificationTransport = selectNotificationTransport;
function selectNotificationTransport(env, factories) {
    const mode = env('NOTIFICATION_TRANSPORT')?.trim().toLowerCase();
    const isProduction = env('NODE_ENV')?.trim().toLowerCase() === 'production';
    if (!mode) {
        if (isProduction) {
            throw new Error('NOTIFICATION_TRANSPORT is required in production: тихая лог-заглушка помечает сообщения как доставленные');
        }
        return factories.log();
    }
    if (mode === 'channels' || mode === 'providers')
        return factories.channels();
    if (mode === 'email')
        return factories.email();
    if (mode === 'realtime')
        return factories.realtime();
    if (mode === 'novu') {
        if (!env('NOVU_API_KEY')?.trim()) {
            if (isProduction)
                throw new Error('NOVU_API_KEY is required for NOTIFICATION_TRANSPORT=novu');
            return factories.log();
        }
        return factories.novu();
    }
    if (mode === 'log')
        return factories.log();
    if (isProduction)
        throw new Error(`Unsupported NOTIFICATION_TRANSPORT: ${mode}`);
    return factories.log();
}
//# sourceMappingURL=notification-transport-selector.js.map