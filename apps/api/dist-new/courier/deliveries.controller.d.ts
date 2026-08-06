import { CourierService } from './courier.service';
import { FailDeliveryDto } from './courier.dto';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { EvidenceService } from '../evidence/evidence.service';
export declare class DeliveriesController {
    private readonly courier;
    private readonly evidence;
    constructor(courier: CourierService, evidence: EvidenceService);
    fail(user: AuthPrincipal, id: string, idempotencyKey: string | undefined, dto: FailDeliveryDto): Promise<{
        orderId: string;
        recorded: boolean;
        status: "out_for_delivery";
    }>;
}
