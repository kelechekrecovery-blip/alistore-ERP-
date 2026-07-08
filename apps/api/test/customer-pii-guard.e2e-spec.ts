import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CustomersModule } from '../src/customers/customers.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Customer PII read policy (optional JWT + masking)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        CustomersModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: {
        phone: `+9967${String(RUN).padStart(6, '0').slice(0, 6)}${String(seq).padStart(2, '0')}`,
        name: `PII ${RUN}`,
      },
    });
  }

  function staffToken(role: string) {
    return jwt.sign({ sub: `staff-${role}-${RUN}`, typ: 'staff', role });
  }

  function customerToken(customerId: string, phone: string) {
    return jwt.sign({ sub: customerId, typ: 'customer', phone });
  }

  it('masks phone for anonymous and seller reads, but reveals it to admin and self', async () => {
    const c = await customer();
    const server = app.getHttpServer();

    const anonymous = await request(server).get(`/customers/${c.id}/overview`).expect(200);
    expect(anonymous.body.customer.phone).not.toBe(c.phone);
    expect(anonymous.body.customer.phone).toMatch(/^\+996\*+\d{2}$/);

    const seller = await request(server)
      .get(`/customers/${c.id}/overview`)
      .set('Authorization', `Bearer ${staffToken('seller')}`)
      .expect(200);
    expect(seller.body.customer.phone).toBe(anonymous.body.customer.phone);

    const admin = await request(server)
      .get(`/customers/${c.id}/overview`)
      .set('Authorization', `Bearer ${staffToken('admin')}`)
      .expect(200);
    expect(admin.body.customer.phone).toBe(c.phone);

    const self = await request(server)
      .get(`/customers/${c.id}`)
      .set('Authorization', `Bearer ${customerToken(c.id, c.phone)}`)
      .expect(200);
    expect(self.body.phone).toBe(c.phone);
  });

  it('rejects an invalid token instead of silently downgrading to anonymous', async () => {
    const c = await customer();
    await request(app.getHttpServer())
      .get(`/customers/${c.id}/overview`)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });

  it('allows customer consent changes only for the authenticated owner', async () => {
    const owner = await customer();
    const other = await customer();

    await request(app.getHttpServer())
      .patch(`/customers/${owner.id}/consent`)
      .set('Authorization', `Bearer ${customerToken(owner.id, owner.phone)}`)
      .send({ consent: true, actor: 'spoof' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/customers/${owner.id}/consent`)
      .set('Authorization', `Bearer ${customerToken(other.id, other.phone)}`)
      .send({ consent: false })
      .expect(403);

    const saved = await prisma.customer.findUniqueOrThrow({ where: { id: owner.id } });
    expect(saved.consent).toBe(true);
  });
});
