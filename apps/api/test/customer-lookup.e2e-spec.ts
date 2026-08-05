import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthzService } from '../src/authz/authz.service';
import { SettingsService } from '../src/settings/settings.service';
import { CustomersService } from '../src/customers/customers.service';
import { CustomersController } from '../src/customers/customers.controller';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import type { AuthPrincipal } from '../src/auth/jwt.strategy';

/**
 * Поиск клиента по телефону для приёмки у прилавка.
 *
 * Скупка Б/У требует `customerId`, а у оператора на руках только телефон
 * продавца. `POST /customers` для этого не годится: он отказывает, если номер
 * уже есть («войдите в аккаунт»), — это гостевое оформление, а не поиск. Без
 * этого эндпоинта экран скупки физически не мог создать заявку.
 *
 * Телефон — персональные данные, поэтому доступ ровно тот же, что у Customer
 * 360: сотрудник с правом `customers:read`. Клиентский JWT сюда не пускаем
 * вовсе — иначе перебором номеров можно собрать базу.
 */
describe('поиск клиента по телефону (приёмка у прилавка)', () => {
  let prisma: PrismaService;
  let controller: CustomersController;
  let seq = 0;

  const staff = (role: string): AuthPrincipal =>
    ({ typ: 'staff', customerId: `staff-${role}`, role }) as unknown as AuthPrincipal;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const authz = new AuthzService();
    await authz.onModuleInit();
    const customers = new CustomersService(prisma, audit, new SettingsService(prisma, audit));
    // `me()` подменяем: роль сотрудника берётся из БД, а фикстурного персонала
    // здесь нет — проверяем правило доступа, а не таблицу сотрудников.
    const staffAuth = { me: async (id: string) => ({ id, role: id.replace('staff-', '') }) } as unknown as StaffAuthService;
    controller = new CustomersController(customers, staffAuth, authz);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedCustomer(): Promise<{ id: string; phone: string }> {
    seq += 1;
    const phone = `+9967001${seq.toString().padStart(4, '0')}`;
    const customer = await prisma.customer.create({ data: { phone, name: 'Продавец' } });
    return { id: customer.id, phone };
  }

  it('находит клиента по точному номеру', async () => {
    const { id, phone } = await seedCustomer();
    const found = await controller.lookup(phone, staff('admin'));
    expect({ id: found.id, phone: found.phone }).toEqual({ id, phone });
  });

  it('находит номер, записанный с пробелами и дефисами', async () => {
    // Оператор набирает так, как видит в паспорте или на бумажке.
    const { id, phone } = await seedCustomer();
    const messy = phone.replace('+996', '+996 ').replace(/(\d{3})(\d{4})$/, '$1-$2');
    const found = await controller.lookup(messy, staff('admin'));
    expect(found.id).toBe(id);
  });

  it('неизвестный номер — 404, а не пустой объект', async () => {
    // Пустой ответ оператор прочитает как «нашли, но без данных» и станет
    // ждать. 404 говорит прямо: такого клиента нет, заводите нового.
    await expect(controller.lookup('+996700000001', staff('admin'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('роль без customers:read не ищет', async () => {
    const { phone } = await seedCustomer();
    await expect(controller.lookup(phone, staff('courier'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('клиентский токен не ищет вовсе — иначе перебор номеров собирает базу', async () => {
    const { phone } = await seedCustomer();
    const asCustomer = { typ: 'customer', customerId: 'someone' } as unknown as AuthPrincipal;
    await expect(controller.lookup(phone, asCustomer)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('пустой номер отвергается до запроса в базу', async () => {
    await expect(controller.lookup('   ', staff('admin'))).rejects.toBeTruthy();
  });
});
