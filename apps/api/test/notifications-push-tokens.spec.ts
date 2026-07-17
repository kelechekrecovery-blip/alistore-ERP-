import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PUSH_TOKEN_PATTERN } from '../src/notifications/push-token.dto';

describe('Notifications push token registry (integration)', () => {
  let prisma: PrismaService;
  let notifications: NotificationsService;

  it('accepts native APNs and FCM tokens while retaining Expo compatibility', () => {
    expect(PUSH_TOKEN_PATTERN.test('ab'.repeat(32))).toBe(true);
    expect(PUSH_TOKEN_PATTERN.test('ExponentPushToken[customer123]')).toBe(true);
    expect(PUSH_TOKEN_PATTERN.test('d3vice-token_1234567890:APA91b-example')).toBe(true);
    expect(PUSH_TOKEN_PATTERN.test('not-a-push-token')).toBe(false);
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    notifications = new NotificationsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pushToken.deleteMany();
    await prisma.staffUser.deleteMany({
      where: { username: { startsWith: 'push-' } },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+99676' } },
    });
  });

  it('rejects anonymous token registration (SEC-011: tokens bind to an authenticated owner)', async () => {
    await expect(
      notifications.registerPushToken({
        token: 'ExponentPushToken[anonymous123]',
        platform: 'ios',
        deviceId: 'ios-install-1',
        scope: 'customer',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(await prisma.pushToken.count()).toBe(0);
  });

  it('binds and refreshes a token for an authenticated customer', async () => {
    const customer = await prisma.customer.create({
      data: { phone: '+996760000001', name: 'Push Customer' },
    });

    const first = await notifications.registerPushToken(
      {
        token: 'ExponentPushToken[customer123]',
        platform: 'android',
        deviceId: 'android-install-1',
      },
      { typ: 'customer', customerId: customer.id, phone: customer.phone },
    );
    const second = await notifications.registerPushToken(
      {
        token: 'ExponentPushToken[customer123]',
        platform: 'android',
        deviceId: 'android-install-2',
      },
      { typ: 'customer', customerId: customer.id, phone: customer.phone },
    );

    expect(second.id).toBe(first.id);
    expect(second.scope).toBe('customer');
    expect(second.customerId).toBe(customer.id);
    expect(second.deviceId).toBe('android-install-2');
    await expect(prisma.pushToken.count({ where: { token: first.token } })).resolves.toBe(1);
  });

  it('binds staff tokens only to active staff accounts', async () => {
    const staff = await prisma.staffUser.create({
      data: {
        username: 'push-cashier',
        passwordHash: 'not-used',
        role: 'cashier',
      },
    });

    const registered = await notifications.registerPushToken(
      {
        token: 'ExponentPushToken[staff123]',
        platform: 'ios',
        deviceId: 'staff-iphone',
      },
      { typ: 'staff', customerId: staff.id, role: staff.role },
    );

    expect(registered.scope).toBe('staff');
    expect(registered.staffId).toBe(staff.id);
    expect(registered.customerId).toBeNull();
  });

  it('binds an FCM registration token to an active Android staff session', async () => {
    const staff = await prisma.staffUser.create({
      data: { username: 'push-android-staff', passwordHash: 'not-used', role: 'seller' },
    });
    const token = 'android-device-token_1234567890:APA91b-alistore';

    const registered = await notifications.registerPushToken(
      { token, platform: 'android', deviceId: 'staff-android-installation' },
      { typ: 'staff', customerId: staff.id, role: staff.role },
    );

    expect(registered).toMatchObject({ token, scope: 'staff', staffId: staff.id, platform: 'android' });
  });
});
