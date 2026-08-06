import { ConfigService } from '@nestjs/config';
export declare class ErrorReporter {
    private readonly logger;
    readonly enabled: boolean;
    constructor(config: ConfigService);
    capture(exception: unknown): void;
}
