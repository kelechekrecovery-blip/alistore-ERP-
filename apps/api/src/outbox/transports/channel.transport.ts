import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
import { EmailNotificationTransport } from './email.transport';
import { LogNotificationTransport } from './log.transport';
import { NovuHttpTransport } from './novu.transport';
import { TelegramBotTransport } from './telegram-bot.transport';
import { WhatsAppCloudTransport } from './whatsapp-cloud.transport';

@Injectable()
export class ChannelNotificationTransport implements NotificationTransport {
  private readonly email: EmailNotificationTransport;
  private readonly log = new LogNotificationTransport();
  private readonly novu?: NovuHttpTransport;
  private readonly telegram?: TelegramBotTransport;
  private readonly whatsapp?: WhatsAppCloudTransport;

  constructor(config: ConfigService) {
    this.email = new EmailNotificationTransport(config);
    if (hasConfig(config, 'NOVU_API_KEY')) {
      this.novu = new NovuHttpTransport(config);
    }
    if (hasConfig(config, 'TELEGRAM_BOT_TOKEN')) {
      this.telegram = new TelegramBotTransport(config);
    }
    if (
      hasConfig(config, 'WHATSAPP_ACCESS_TOKEN') &&
      hasConfig(config, 'WHATSAPP_PHONE_NUMBER_ID')
    ) {
      this.whatsapp = new WhatsAppCloudTransport(config);
    }
  }

  deliver(message: DeliverableMessage): Promise<void> {
    switch (message.channel) {
      case 'email':
        return this.email.deliver(message);
      case 'telegram':
        return (this.telegram ?? this.log).deliver(message);
      case 'whatsapp':
        return (this.whatsapp ?? this.log).deliver(message);
      case 'push':
      case 'sms':
      case 'webhook':
        return (this.novu ?? this.log).deliver(message);
      default:
        return this.log.deliver(message);
    }
  }
}

function hasConfig(config: ConfigService, key: string): boolean {
  const value = config.get<string>(key);
  return typeof value === 'string' && value.trim().length > 0;
}
