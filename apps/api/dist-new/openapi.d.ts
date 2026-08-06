import { INestApplication } from '@nestjs/common';
import type { RuntimeEnvReader } from './config/runtime-security';
export declare function shouldExposeOpenApi(env?: RuntimeEnvReader): boolean;
export declare function setupOpenApi(app: INestApplication, enabled?: boolean): void;
