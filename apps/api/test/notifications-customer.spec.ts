import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';

describe('Customer notification inbox (ownership)', () => {
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let controller: NotificationsController;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    notifications = new NotificationsService(prisma);
    controller = new NotificationsController(notifications);
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+99677${run}` } } });
    await prisma.$disconnect();
  });

  it('lists only the authenticated customer inbox and marks a notification read idempotently', async () => {
    const first = await prisma.customer.create({
      data: { phone: `+99677${run}01`, name: 'Notification owner', consent: true },
    });
    const second = await prisma.customer.create({
      data: { phone: `+99677${run}02`, name: 'Other customer', consent: true },
    });
    const own = await prisma.customerNotification.create({
      data: {
        customerId: first.id,
        template: 'order_ready',
        title: 'Заказ готов',
        detail: 'Заказ №2401 можно забрать',
        symbol: 'checkmark.circle.fill',
        route: 'order',
        referenceId: 'order-2401',
      },
    });
    await prisma.customerNotification.create({
      data: {
        customerId: second.id,
        template: 'order_ready',
        title: 'Чужое уведомление',
        detail: 'Не должно быть видно',
      },
    });

    const listed = await controller.mine({ typ: 'customer', customerId: first.id }, '20');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: own.id, customerId: first.id, route: 'order' });

    const read = await controller.markRead({ typ: 'customer', customerId: first.id }, own.id);
    expect(read.readAt).toBeInstanceOf(Date);
    const replay = await controller.markRead({ typ: 'customer', customerId: first.id }, own.id);
    expect(replay.readAt?.getTime()).toBe(read.readAt?.getTime());
    expect(() => controller.mine({ typ: 'staff', customerId: first.id })).toThrow('customer JWT');
  });

  it('does not reveal another customer notification by id', async () => {
    const owner = await prisma.customer.create({
      data: { phone: `+99677${run}03`, name: 'Notification owner 2', consent: true },
    });
    const other = await prisma.customer.create({
      data: { phone: `+99677${run}04`, name: 'Other customer 2', consent: true },
    });
    const notification = await prisma.customerNotification.create({
      data: { customerId: owner.id, template: 'warranty_created', title: 'Сервис', detail: 'Готово' },
    });

    await expect(controller.markRead({ typ: 'customer', customerId: other.id }, notification.id))
      .rejects.toThrow('Уведомление не найдено');
    await expect(notifications.listMine(other.id)).resolves.toEqual([]);
  });
});
