import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LocalizationModule } from '../src/localization/localization.module';

/** RU / КЫ resolution through nestjs-i18n. */
describe('Localization (nestjs-i18n)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LocalizationModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves the Kyrgyz greeting for ?lang=ky', async () => {
    const res = await request(app.getHttpServer())
      .get('/i18n/greeting?lang=ky')
      .expect(200);
    expect(res.body.message).toBe('Саламатсызбы');
  });

  it('resolves the Russian greeting for ?lang=ru', async () => {
    const res = await request(app.getHttpServer())
      .get('/i18n/greeting?lang=ru')
      .expect(200);
    expect(res.body.message).toBe('Здравствуйте');
  });

  it('falls back to Russian when no language is given', async () => {
    const res = await request(app.getHttpServer())
      .get('/i18n/greeting')
      .expect(200);
    expect(res.body.message).toBe('Здравствуйте');
  });
});
