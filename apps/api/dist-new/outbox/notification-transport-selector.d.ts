import { NotificationTransport } from './outbox.types';
export type TransportEnvReader = (name: string) => string | undefined;
export interface TransportFactories {
    channels: () => NotificationTransport;
    novu: () => NotificationTransport;
    email: () => NotificationTransport;
    realtime: () => NotificationTransport;
    log: () => NotificationTransport;
}
export declare function selectNotificationTransport(env: TransportEnvReader, factories: TransportFactories): NotificationTransport;
