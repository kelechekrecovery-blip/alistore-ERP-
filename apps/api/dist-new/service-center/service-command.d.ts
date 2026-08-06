import { Prisma } from '@prisma/client';
export type ServiceCommandInput = Prisma.InputJsonObject;
export declare function requiredServiceKey(value?: string): string;
export declare function serviceJson(value: unknown): Prisma.InputJsonValue;
export declare function replayServiceCommand(command: {
    action: string;
    request: Prisma.JsonValue;
    response: Prisma.JsonValue;
}, action: string, request: ServiceCommandInput): Prisma.JsonValue;
export declare function isServiceCommandUniqueViolation(error: unknown): boolean;
