import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://alistore@localhost:5432/alistore_test?schema=public';

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});
export const API_BASE = `http://127.0.0.1:${Number(process.env.E2E_API_PORT ?? 4200)}/api`;

export async function resetDb() {
  await prisma.outboxMessage.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.giftCard.deleteMany();
  await prisma.productReview.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.warrantyCase.deleteMany();
  await prisma.debtPlan.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.supplierRma.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.deviceUnit.deleteMany();
  await prisma.product.deleteMany();
  await prisma.tradeInDevice.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.cashShift.deleteMany();
  await prisma.courierRun.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.staffUser.deleteMany();
}

export async function seedProduct(prefix: string, price = 100000, cost = 80000) {
  const suffix = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const product = await prisma.product.create({
    data: { sku: suffix, name: `${prefix} iPhone`, price, cost, category: 'phones', attrs: {} },
  });
  const unit = await prisma.deviceUnit.create({
    data: { imei: `${suffix}-IMEI`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
  });
  return { product, unit };
}

export async function bootstrapStaff(
  request: APIRequestContext,
  role: Role = 'owner',
): Promise<string> {
  const username = `e2e-${role}-${Date.now().toString(36)}`;
  await postJson(request, '/staff-auth/bootstrap', { username, password: 'pass-e2e' });
  if (role !== 'owner') {
    const ownerLogin = await postJson<{ accessToken: string }>(request, '/staff-auth/login', {
      username,
      password: 'pass-e2e',
    });
    const staffUsername = `e2e-${role}-${Date.now().toString(36)}-staff`;
    await postJson(
      request,
      '/staff-auth/staff',
      { username: staffUsername, password: 'pass-e2e', role },
      ownerLogin.accessToken,
    );
    const staffLogin = await postJson<{ accessToken: string }>(request, '/staff-auth/login', {
      username: staffUsername,
      password: 'pass-e2e',
    });
    return staffLogin.accessToken;
  }
  const login = await postJson<{ accessToken: string }>(request, '/staff-auth/login', {
    username,
    password: 'pass-e2e',
  });
  return login.accessToken;
}

export async function customerToken(request: APIRequestContext, phone: string): Promise<string> {
  const challenge = await postJson<{ devCode: string }>(request, '/auth/otp/request', { phone });
  const tokens = await postJson<{ accessToken: string }>(request, '/auth/otp/verify', {
    phone,
    code: challenge.devCode,
  });
  return tokens.accessToken;
}

export async function postJson<T>(
  request: APIRequestContext,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await request.post(`${API_BASE}${path}`, {
    data: body,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

export async function patchJson<T>(
  request: APIRequestContext,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await request.patch(`${API_BASE}${path}`, {
    data: body,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}
