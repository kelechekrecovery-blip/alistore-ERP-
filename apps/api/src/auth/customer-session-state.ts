export const DELETED_CUSTOMER_PHONE_PREFIX = 'deleted:';

export function isActiveCustomerPhone(phone: string): boolean {
  return !phone.startsWith(DELETED_CUSTOMER_PHONE_PREFIX);
}

export function deletedCustomerPhone(customerId: string): string {
  return `${DELETED_CUSTOMER_PHONE_PREFIX}${customerId}`;
}
