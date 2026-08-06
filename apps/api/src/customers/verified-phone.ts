import type { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';

const CANONICAL_PHONE = /^\+\d{9,15}$/;

/**
 * Commerce may only use a phone proven by OTP. Guest checkout remains a
 * separate, explicitly capability-scoped flow and must not call this helper.
 */
export async function assertVerifiedCustomerPhone(
  prisma: Pick<PrismaService, 'customer'>,
  customerId: string,
): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true, phoneVerifiedAt: true },
  });
  if (!customer) {
    throw new ValidationError('customer_not_found', 'Аккаунт не найден');
  }
  if (!customer.phone || !CANONICAL_PHONE.test(customer.phone) || !customer.phoneVerifiedAt) {
    throw new ValidationError(
      'phone_verification_required',
      'Подтвердите номер телефона перед оформлением заказа или оплатой',
    );
  }
}
