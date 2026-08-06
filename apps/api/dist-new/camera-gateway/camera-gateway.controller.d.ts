import { AuthPrincipal } from '../auth/jwt.strategy';
import { IngestCameraEventDto, RegisterEdgeDeviceDto } from './camera-gateway.dto';
import { CameraGatewayService } from './camera-gateway.service';
export declare class CameraGatewayController {
    private readonly gateway;
    constructor(gateway: CameraGatewayService);
    register(dto: RegisterEdgeDeviceDto, user: AuthPrincipal): Promise<{
        deviceId: string;
        storePointId: string;
        secret: string;
    }>;
    ingest(dto: IngestCameraEventDto, secret?: string, timestamp?: string, signature?: string): Promise<{
        eventId: string;
        accepted: boolean;
        replay: boolean;
        action: string;
        retentionUntil: Date | null;
    }>;
}
