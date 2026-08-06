import { UnitsService } from './units.service';
export declare class UnitsController {
    private readonly units;
    constructor(units: UnitsService);
    get(imei: string): Promise<{
        imei: string;
        productId: string;
        status: import(".prisma/client").$Enums.UnitStatus;
        location: string;
        orderId: string | null;
        product: string;
        sku: string;
        price: number;
    }>;
}
