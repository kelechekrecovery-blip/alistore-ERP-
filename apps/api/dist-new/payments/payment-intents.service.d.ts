import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto, PaymentWebhookDto } from './payment-intents.dto';
import { GatewayWebhookRequest, PaymentGatewayProvider, PaymentIntentView } from './payment-gateway-provider';
export type { PaymentIntentView } from './payment-gateway-provider';
export declare class PaymentIntentsService {
    private readonly prisma;
    private readonly orders;
    private readonly payments;
    private readonly gateway;
    constructor(prisma: PrismaService, orders: OrdersService, payments: PaymentsService, gateway: PaymentGatewayProvider);
    create(dto: CreatePaymentIntentDto, idempotencyKey?: string): Promise<PaymentIntentView>;
    createForCustomer(customerId: string, dto: CreatePaymentIntentDto, idempotencyKey?: string): Promise<PaymentIntentView>;
    private replay;
    confirmSandboxIntent(intentId: string, expectedProvider?: string): Promise<PaymentWebhookResult>;
    webhook(dto: PaymentWebhookDto, request?: Omit<GatewayWebhookRequest, 'payload'>): Promise<PaymentWebhookResult>;
    private applyWebhookPayload;
    private parkCancelledOrderPayment;
}
type PaymentWebhookResult = Awaited<ReturnType<PaymentsService['pay']>> & {
    parked?: boolean;
};
