import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { IngestCameraEventDto, RegisterEdgeDeviceDto } from './camera-gateway.dto';
export declare class CameraGatewayService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    register(dto: RegisterEdgeDeviceDto, actor: string): Promise<{
        deviceId: string;
        storePointId: string;
        secret: string;
    }>;
    ingest(dto: IngestCameraEventDto, secret: string, timestamp: string, signature: string): Promise<{
        eventId: string;
        accepted: boolean;
        replay: boolean;
        action: string;
        retentionUntil: Date | null;
    }>;
}
