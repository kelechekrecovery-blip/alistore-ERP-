import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerAddressDto, UpdateCustomerAddressDto, UpdateCustomerSettingsDto, UpsertCustomerDto } from './customers.dto';
import { CustomerOverview } from './customer-overview';
export declare class CustomersService {
    private readonly prisma;
    private readonly audit;
    private readonly ownerSettings;
    constructor(prisma: PrismaService, audit: AuditService, ownerSettings: SettingsService);
    get(id: string): import(".prisma/client").Prisma.Prisma__CustomerClient<{
        id: string;
        name: string;
        createdAt: Date;
        email: string | null;
        phone: string;
        emailVerifiedAt: Date | null;
        consent: boolean;
        segments: string[];
        ltv: number;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs>;
    loyalty(customerId: string): Promise<{
        balance: number;
        conversion: number;
        level: string;
        nextLevelSpend: number;
        coupons: {
            id: string;
            code: string;
            createdAt: Date;
            active: boolean;
            customerId: string;
            expiresAt: Date | null;
            title: string;
            valueLabel: string;
        }[];
        history: {
            id: string;
            sourceRef: string | null;
            orderId: string | null;
            amount: number;
            createdAt: Date;
            customerId: string;
            expiresAt: Date | null;
            kind: string;
            label: string;
            paymentId: string | null;
        }[];
    }>;
    addresses(customerId: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        idempotencyKey: string | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        text: string;
        title: string;
        comment: string | null;
        isPrimary: boolean;
    }[]>;
    createAddress(customerId: string, dto: CreateCustomerAddressDto, idempotencyKey: string): Promise<{
        id: string;
        idempotencyKey: string | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        text: string;
        title: string;
        comment: string | null;
        isPrimary: boolean;
    }>;
    updateAddress(customerId: string, addressId: string, dto: UpdateCustomerAddressDto): Promise<{
        id: string;
        idempotencyKey: string | null;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        text: string;
        title: string;
        comment: string | null;
        isPrimary: boolean;
    }>;
    deleteAddress(customerId: string, addressId: string): Promise<{
        id: string;
    }>;
    settings(customerId: string): Promise<{
        push: boolean;
        whatsapp: boolean;
        service: boolean;
        promos: boolean;
        id: string;
        phone: string;
        email: string | null;
        emailVerified: boolean;
        name: string;
        consent: boolean;
    }>;
    updateSettings(customerId: string, dto: UpdateCustomerSettingsDto): Promise<{
        push: boolean;
        whatsapp: boolean;
        service: boolean;
        promos: boolean;
        id: string;
        phone: string;
        name: string;
        consent: boolean;
    }>;
    setConsent(customerId: string, consent: boolean, actor: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        email: string | null;
        phone: string;
        emailVerifiedAt: Date | null;
        consent: boolean;
        segments: string[];
        ltv: number;
    }>;
    upsert(dto: UpsertCustomerDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        email: string | null;
        phone: string;
        emailVerifiedAt: Date | null;
        consent: boolean;
        segments: string[];
        ltv: number;
    }>;
    findByPhone(phone: string): Promise<{
        id: string;
        name: string;
        phone: string;
    } | null>;
    createGuest(dto: UpsertCustomerDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        email: string | null;
        phone: string;
        emailVerifiedAt: Date | null;
        consent: boolean;
        segments: string[];
        ltv: number;
    }>;
    exportData(customerId: string): Promise<{
        exportedAt: string;
        profile: {
            id: string;
            phone: string;
            name: string;
            consent: boolean;
            createdAt: Date;
        };
        addresses: {
            id: string;
            idempotencyKey: string | null;
            createdAt: Date;
            updatedAt: Date;
            customerId: string;
            text: string;
            title: string;
            comment: string | null;
            isPrimary: boolean;
        }[];
        orders: {
            id: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            createdAt: Date;
            channel: string;
            pickupPoint: string | null;
            deliveryAddress: string | null;
            total: number;
        }[];
        loyaltyEntries: {
            id: string;
            sourceRef: string | null;
            orderId: string | null;
            amount: number;
            createdAt: Date;
            customerId: string;
            expiresAt: Date | null;
            kind: string;
            label: string;
            paymentId: string | null;
        }[];
        coupons: {
            id: string;
            code: string;
            createdAt: Date;
            active: boolean;
            customerId: string;
            expiresAt: Date | null;
            title: string;
            valueLabel: string;
        }[];
        tradeIns: {
            id: string;
            imei: string | null;
            grade: import(".prisma/client").$Enums.Grade;
            price: number;
            model: string;
            contractId: string | null;
        }[];
        warranties: {
            id: string;
            status: import(".prisma/client").$Enums.WarrantyStatus;
            imei: string;
            problem: string;
        }[];
        tickets: {
            id: string;
            status: import(".prisma/client").$Enums.TicketStatus;
            createdAt: Date;
            subject: string;
        }[];
        reviews: {
            id: string;
            status: string;
            createdAt: Date;
            sku: string;
            text: string | null;
            rating: number;
        }[];
        notifications: {
            push: boolean;
            whatsapp: boolean;
            service: boolean;
            promos: boolean;
            consent: boolean;
        };
    }>;
    deleteAccount(customerId: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    devices(customerId: string): Promise<{
        imei: string;
        product: string;
        status: import(".prisma/client").$Enums.UnitStatus;
        warrantyUntil: string | null;
        daysLeft: number | null;
        warranty: {
            id: string;
            status: import(".prisma/client").$Enums.WarrantyStatus;
            imei: string;
            customerId: string;
            assignee: string | null;
            problem: string;
            serviceType: import(".prisma/client").$Enums.ServiceCaseType;
            deviceName: string | null;
            sla: Date;
            slaEscalatedAt: Date | null;
        } | null;
    }[]>;
    overview(customerId: string): Promise<CustomerOverview>;
}
