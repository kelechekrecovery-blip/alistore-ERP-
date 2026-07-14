import { Prisma } from '@prisma/client';
import { ConflictError, ValidationError } from '../common/errors';

export type ServiceCommandInput = Prisma.InputJsonObject;

export function requiredServiceKey(value?: string) {
  const key = value?.trim();
  if (!key || key.length > 128) {
    throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
  }
  return key;
}

export function serviceJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function replayServiceCommand(
  command: { action: string; request: Prisma.JsonValue; response: Prisma.JsonValue },
  action: string,
  request: ServiceCommandInput,
) {
  if (command.action !== action || canonical(command.request) !== canonical(request)) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой service-командой');
  }
  return command.response;
}

export function isServiceCommandUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
