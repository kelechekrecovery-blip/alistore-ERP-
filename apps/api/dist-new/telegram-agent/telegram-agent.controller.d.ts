import { AuthPrincipal } from '../auth/jwt.strategy';
import { TelegramAgentService } from './telegram-agent.service';
import { TelegramAgentStepUpDto } from './telegram-agent.dto';
export declare class TelegramAgentController {
    private readonly agent;
    constructor(agent: TelegramAgentService);
    createPairing(user: AuthPrincipal, dto: TelegramAgentStepUpDto): Promise<{
        code: string;
        expiresAt: Date;
        command: string;
        warning: string;
    }>;
    disconnect(user: AuthPrincipal, dto: TelegramAgentStepUpDto): Promise<{
        disconnected: boolean;
    }>;
    webhook(secret: string | undefined, update: unknown): Promise<{
        ok: true;
    }>;
}
