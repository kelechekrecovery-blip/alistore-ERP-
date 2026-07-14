import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { sign } from 'jsonwebtoken';

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://alistore@localhost:5432/alistore_test?schema=public';

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});
export const API_BASE = `http://127.0.0.1:${Number(process.env.E2E_API_PORT ?? 4200)}/api`;

export async function resetDb() {
  await prisma.orderBundleAllocation.deleteMany();
  await prisma.productBundleComponent.deleteMany();
  await prisma.staffTask.deleteMany();
  await prisma.deviceProtectionPolicy.deleteMany();
  await prisma.b2BQuote.deleteMany();
  await prisma.businessBuyerProfile.deleteMany();
  await prisma.outboxMessage.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.giftCard.deleteMany();
  await prisma.productReview.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.warrantyCase.deleteMany();
  await prisma.debtPlan.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.supplierRma.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.financeBudgetCommand.deleteMany();
  await prisma.financeBudget.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customerIdentity.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.quantityConsignmentAdjustment.deleteMany();
  await prisma.quantityConsignmentAllocation.deleteMany();
  await prisma.orderQuantityAllocation.deleteMany();
  await prisma.quantityConsignmentLot.deleteMany();
  await prisma.consignmentAdjustment.deleteMany();
  await prisma.consignmentItem.deleteMany();
  await prisma.consignmentPayout.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.return.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryBalance.deleteMany();
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
  _request: APIRequestContext,
  role: Role = 'owner',
): Promise<string> {
  const username = `e2e-${role}-${Date.now().toString(36)}`;
  const staff = await prisma.staffUser.create({
    data: {
      username,
      passwordHash: await argon2.hash('pass-e2e'),
      role,
    },
  });
  return sign({ sub: staff.id, role: staff.role, typ: 'staff' }, 'dev-secret-alistore-local', { expiresIn: '8h' });
}

export async function seedStaffCredentials(role: Role = 'owner', prefix = 'e2e') {
  const username = `${prefix}-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const password = 'pass-e2e';
  const staff = await prisma.staffUser.create({
    data: { username, passwordHash: await argon2.hash(password), role },
  });
  return {
    staffId: staff.id,
    username,
    password,
    accessToken: sign(
      { sub: staff.id, role: staff.role, typ: 'staff' },
      'dev-secret-alistore-local',
      { expiresIn: '8h' },
    ),
  };
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
  headers?: Record<string, string>,
): Promise<T> {
  const response = await request.post(`${API_BASE}${path}`, {
    data: body,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
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
