import { B2BQuoteStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateB2BQuoteDto, UpdateB2BQuoteDto, UpsertBusinessProfileDto } from './b2b.dto';
export declare class B2BService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    profile(customerId: string): import(".prisma/client").Prisma.Prisma__BusinessBuyerProfileClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        customerId: string;
        companyName: string;
        taxId: string;
        contactName: string;
        billingAddress: string;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    upsertProfile(customerId: string, dto: UpsertBusinessProfileDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        customerId: string;
        companyName: string;
        taxId: string;
        contactName: string;
        billingAddress: string;
    }>;
    mine(customerId: string): import(".prisma/client").Prisma.PrismaPromise<({
        items: {
            id: string;
            name: string;
            sku: string;
            qty: number;
            targetPrice: number | null;
            quoteId: string;
            listPrice: number;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.B2BQuoteStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        fulfillmentType: string;
        pickupPoint: string | null;
        deliveryAddress: string | null;
        validUntil: Date | null;
        comment: string | null;
        paymentIntent: string;
        quotedTotal: number | null;
        staffNote: string | null;
        listTotal: number;
    })[]>;
    list(status?: B2BQuoteStatus): Promise<{
        profile: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            customerId: string;
            companyName: string;
            taxId: string;
            contactName: string;
            billingAddress: string;
        } | null;
        items: {
            id: string;
            name: string;
            sku: string;
            qty: number;
            targetPrice: number | null;
            quoteId: string;
            listPrice: number;
        }[];
        id: string;
        status: import(".prisma/client").$Enums.B2BQuoteStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        fulfillmentType: string;
        pickupPoint: string | null;
        deliveryAddress: string | null;
        validUntil: Date | null;
        comment: string | null;
        paymentIntent: string;
        quotedTotal: number | null;
        staffNote: string | null;
        listTotal: number;
    }[]>;
    request(customerId: string, dto: CreateB2BQuoteDto): Promise<{
        items: {
            id: string;
            name: string;
            sku: string;
            qty: number;
            targetPrice: number | null;
            quoteId: string;
            listPrice: number;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.B2BQuoteStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        fulfillmentType: string;
        pickupPoint: string | null;
        deliveryAddress: string | null;
        validUntil: Date | null;
        comment: string | null;
        paymentIntent: string;
        quotedTotal: number | null;
        staffNote: string | null;
        listTotal: number;
    }>;
    update(id: string, dto: UpdateB2BQuoteDto, actor: string): Promise<{
        items: {
            id: string;
            name: string;
            sku: string;
            qty: number;
            targetPrice: number | null;
            quoteId: string;
            listPrice: number;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.B2BQuoteStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        fulfillmentType: string;
        pickupPoint: string | null;
        deliveryAddress: string | null;
        validUntil: Date | null;
        comment: string | null;
        paymentIntent: string;
        quotedTotal: number | null;
        staffNote: string | null;
        listTotal: number;
    }>;
    accept(id: string, customerId: string): Promise<{
        items: {
            id: string;
            name: string;
            sku: string;
            qty: number;
            targetPrice: number | null;
            quoteId: string;
            listPrice: number;
        }[];
    } & {
        id: string;
        status: import(".prisma/client").$Enums.B2BQuoteStatus;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        fulfillmentType: string;
        pickupPoint: string | null;
        deliveryAddress: string | null;
        validUntil: Date | null;
        comment: string | null;
        paymentIntent: string;
        quotedTotal: number | null;
        staffNote: string | null;
        listTotal: number;
    }>;
    private updatedEvent;
    private assertCustomer;
}
