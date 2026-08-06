import { SupplierRmaService } from './supplier-rma.service';
import { CreateSupplierDto, OpenRmaDto, RmaTransitionDto } from './suppliers.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class SuppliersController {
    private readonly rma;
    constructor(rma: SupplierRmaService);
    createSupplier(dto: CreateSupplierDto): import(".prisma/client").Prisma.Prisma__SupplierClient<{
        id: string;
        name: string;
        createdAt: Date;
        contact: string | null;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    listSuppliers(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        contact: string | null;
    }[]>;
    scorecard(): Promise<import("./scorecard").SupplierScore[]>;
    openRma(user: AuthPrincipal, dto: OpenRmaDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }>;
    listRmas(supplierId?: string, status?: string): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }[]>;
    transition(user: AuthPrincipal, id: string, dto: RmaTransitionDto): Promise<{
        id: string;
        status: import(".prisma/client").$Enums.RmaStatus;
        createdAt: Date;
        imei: string;
        supplierId: string;
        sla: Date;
        defect: string;
        resolution: string | null;
    }>;
}
