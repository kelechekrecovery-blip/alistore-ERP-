import { ConfigService } from '@nestjs/config';
export declare function resolveJwtSecret(config: ConfigService): string;
export declare function resolveJwtSecretFromEnv(env?: NodeJS.ProcessEnv): string;
