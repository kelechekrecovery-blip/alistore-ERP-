import { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentGatewayProvider } from '../payments/payment-gateway-provider';
import { RefundProcessor } from './refunds.processor';
export declare class RefundWebhooksController {
    private readonly gateway;
    private readonly processor;
    constructor(gateway: PaymentGatewayProvider, processor: RefundProcessor);
    receive(request: RawBodyRequest<Request>, headers: Record<string, string | string[] | undefined>, body: unknown): Promise<{
        accepted: boolean;
    }>;
}
