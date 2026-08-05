import { ValidationError } from '../common/errors';

export const PHONE_INPUT_PATTERN = /^\+?[1-9]\d{8,14}$/;

/** Canonical storage and lookup form for every inbound phone identity. */
export function normalizePhone(rawPhone: string): string {
  const phone = rawPhone.trim();
  if (!PHONE_INPUT_PATTERN.test(phone)) {
    throw new ValidationError('phone_invalid', 'Некорректный номер телефона');
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}
