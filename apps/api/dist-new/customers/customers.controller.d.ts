import { CustomersService } from './customers.service';
import { CreateCustomerAddressDto, SetConsentDto, UpdateCustomerAddressDto, UpdateCustomerSettingsDto, UpsertCustomerDto } from './customers.dto';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { CustomerOverview } from './customer-overview';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { AuthzService } from '../authz/authz.service';
export declare class CustomersController {
    private readonly customers;
    private readonly staffAuth;
    private readonly authz;
    constructor(customers: CustomersService, staffAuth: StaffAuthService, authz: AuthzService);
    loyalty(user: AuthPrincipal): Promise<{
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
    addresses(user: AuthPrincipal): import(".prisma/client").Prisma.PrismaPromise<{
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
    createAddress(user: AuthPrincipal, idempotencyKey: string | undefined, dto: CreateCustomerAddressDto): Promise<{
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
    updateAddress(user: AuthPrincipal, addressId: string, dto: UpdateCustomerAddressDto): Promise<{
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
    deleteAddress(user: AuthPrincipal, addressId: string): Promise<{
        id: string;
    }>;
    settings(user: AuthPrincipal): Promise<{
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
    updateSettings(user: AuthPrincipal, dto: UpdateCustomerSettingsDto): Promise<{
        push: boolean;
        whatsapp: boolean;
        service: boolean;
        promos: boolean;
        id: string;
        phone: string;
        name: string;
        consent: boolean;
    }>;
    exportData(user: AuthPrincipal): Promise<{
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
    deleteAccount(user: AuthPrincipal): Promise<{
        id: string;
        deleted: boolean;
    }>;
    myDevices(user: AuthPrincipal): Promise<{
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
    lookup(phone: string, user: AuthPrincipal): Promise<{
        id: string;
        name: string;
        phone: string;
    }>;
    overview(id: string, user: AuthPrincipal): Promise<CustomerOverview>;
    get(id: string, user: AuthPrincipal): Promise<{
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
        guestCapability: string;
        capabilityExpiresIn: number;
    }>;
    setConsent(id: string, dto: SetConsentDto, user: AuthPrincipal): Promise<{
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
    private assertCanReadCustomer;
    private assertCustomer;
    private maskOverview;
    private maskCustomer;
    private canReadPii;
    private maskPhone;
}
