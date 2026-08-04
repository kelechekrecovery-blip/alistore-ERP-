import { ServiceUnavailableException } from '@nestjs/common';
import { OtpSender, SendOtpInput } from './otp-sender';

export interface ProductionOtpSenderOptions {
  apiUrl: string;
  apiKey: string;
  senderId: string;
}

export class ProductionOtpSender implements OtpSender {
  readonly name = 'production' as const;

  constructor(private readonly options: ProductionOtpSenderOptions) {}

  assertOperational(): void {
    this.unavailable();
  }

  send(_input: SendOtpInput): Promise<void> {
    return this.unavailable();
  }

  isConfigured(): boolean {
    return Object.values(this.options).every((value) => value.length > 0);
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'production_sms_provider_not_activated',
      message: 'Боевой SMS-адаптер ждёт договор и спецификацию провайдера',
    });
  }
}
