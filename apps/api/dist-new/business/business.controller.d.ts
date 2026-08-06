import { JwtService } from '@nestjs/jwt';
import { BusinessAuthService } from './business-auth.service';
import { BusinessProductsService } from './business-products.service';
import type { AuthPrincipal } from '../auth/jwt.strategy';
declare class BusinessLoginDto {
    username: string;
    password: string;
}
declare class UpdatePriceDto {
    price: number;
}
export declare class BusinessController {
    private readonly auth;
    private readonly products;
    private readonly jwt;
    constructor(auth: BusinessAuthService, products: BusinessProductsService, jwt: JwtService);
    login(dto: BusinessLoginDto): Promise<{
        accessToken: string;
        seller: {
            id: string;
            name: string;
        };
        username: string;
    }>;
    list(user: AuthPrincipal): Promise<import("./business-products.service").BusinessProductView[]>;
    updatePrice(user: AuthPrincipal, id: string, dto: UpdatePriceDto): Promise<{
        id: string;
        name: string;
        sku: string;
        price: number;
        category: string;
        archived: boolean;
    }>;
}
export {};
