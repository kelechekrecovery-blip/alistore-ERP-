import { ValidationError } from '../common/errors';

/** Canonical storage and lookup form for every inbound phone identity. */
export function normalizePhone(rawPhone: string): string {
  const phone = rawPhone.trim();
  if (!/^\+?[1-9]\d{8,14}$/.test(phone)) {
    throw new ValidationError('phone_invalid', 'Некорректный номер телефона');
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}
