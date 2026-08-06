import { PrismaService } from '../prisma/prisma.service';
export interface BusinessSession {
    typ: 'seller';
    userId: string;
    sellerId: string;
    sellerName: string;
    username: string;
}
export declare class BusinessAuthService {
    private readonly prisma;
    private static readonly MIN_PASSWORD;
    constructor(prisma: PrismaService);
    createUser(sellerId: string, username: string, password: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        sellerId: string;
        username: string;
        passwordHash: string;
    }>;
    login(username: string, password: string): Promise<BusinessSession>;
}
