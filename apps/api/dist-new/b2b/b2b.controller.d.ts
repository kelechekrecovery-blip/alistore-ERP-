import { AuthPrincipal } from '../auth/jwt.strategy';
import { CreateB2BQuoteDto, ListB2BQuotesQueryDto, UpdateB2BQuoteDto, UpsertBusinessProfileDto } from './b2b.dto';
import { B2BService } from './b2b.service';
export declare class B2BController {
    private readonly b2b;
    constructor(b2b: B2BService);
    profile(user: AuthPrincipal): import(".prisma/client").Prisma.Prisma__BusinessBuyerProfileClient<{
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
    upsertProfile(user: AuthPrincipal, dto: UpsertBusinessProfileDto): Promise<{
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
    mine(user: AuthPrincipal): import(".prisma/client").Prisma.PrismaPromise<({
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
    request(user: AuthPrincipal, dto: CreateB2BQuoteDto): Promise<{
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
    accept(user: AuthPrincipal, id: string): Promise<{
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
    list(query: ListB2BQuotesQueryDto): Promise<{
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
    update(user: AuthPrincipal, id: string, dto: UpdateB2BQuoteDto): Promise<{
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
    private customerId;
}
