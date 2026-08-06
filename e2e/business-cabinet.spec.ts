import { expect, test } from '@playwright/test';
import * as argon2 from 'argon2';
import { API_BASE, prisma, resetDb, seedProduct } from './helpers';

/**
 * AliStore Business — кабинет партнёра целиком, от входа до цены на витрине.
 *
 * Юнит-тесты доказывают изоляцию на уровне сервиса. Здесь проверяется то, что
 * они доказать не могут: что браузер действительно доносит вход до списка, что
 * смена цены доезжает до публичного каталога, и что чужой токен не открывает
 * ERP по HTTP — а не только в вызове метода.
 */
const PASSWORD = 'ДемоПарольE2E2026';

async function seedPartner(name: string) {
  const slug = `${name.toLowerCase()}-${Date.now().toString(36)}`;
  const seller = await prisma.seller.create({ data: { name, slug } });
  const username = `e2e-${slug}`;
  await prisma.sellerUser.create({
    data: { sellerId: seller.id, username, passwordHash: await argon2.hash(PASSWORD) },
  });
  return { seller, username };
}

test('партнёр входит, видит только свои позиции и меняет цену', async ({ page }) => {
  await resetDb();
  const alfa = await seedPartner('Альфа');
  const beta = await seedPartner('Бета');

  const mine = await seedProduct('BIZ-MINE', 18_900);
  const foreign = await seedProduct('BIZ-FOREIGN', 24_500);
  await prisma.product.update({ where: { id: mine.product.id }, data: { sellerId: alfa.seller.id } });
  await prisma.product.update({ where: { id: foreign.product.id }, data: { sellerId: beta.seller.id } });

  await page.goto('/business');
  await page.getByLabel('Логин').fill(alfa.username);
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByRole('heading', { name: 'Альфа' })).toBeVisible();
  // Кабинет открывается на «Обзоре» — список живёт во вкладке «Ассортимент».
  await page.getByRole('button', { name: 'Ассортимент' }).first().click();
  // Артикул в DOM дважды — десктопная таблица и мобильная карточка, одна из
  // них скрыта через CSS. Берём первую видимую, а не «единственную».
  await expect(page.getByText(mine.product.sku).first()).toBeVisible();
  // Чужая позиция не должна появиться даже строкой: список — это граница.
  await expect(page.getByText(foreign.product.sku)).toHaveCount(0);

  // Та же причина: поле цены существует и в таблице, и в мобильной карточке.
  await page.getByLabel(`Новая цена: ${mine.product.name}`).first().fill('17500');
  await page.getByRole('button', { name: 'Сохранить' }).first().click();
  await expect(page.getByText('цена сохранена')).toBeVisible();

  // Цена доезжает до публичного каталога — иначе кабинет менял бы что-то своё.
  const response = await page.request.get(`${API_BASE}/catalog/products?q=${mine.product.sku}`);
  const body = (await response.json()) as { items: Array<{ sku: string; price: number; seller?: { name: string } }> };
  const listed = body.items.find((item) => item.sku === mine.product.sku);
  expect(listed?.price).toBe(17_500);
  expect(listed?.seller?.name).toBe('Альфа');

  // Изменение записано в Event Ledger вместе с прежней ценой.
  // Ищем по `refs` — это единственное поле связи в леджере. Первая версия
  // теста искала по несуществующему `entityId`, и это вскрыло, что событие
  // вообще не несло ссылки на товар.
  const event = await prisma.auditEvent.findFirst({
    where: { type: 'price.changed', refs: { has: mine.product.id } },
    orderBy: { ts: 'desc' },
  });
  // Актор называет и магазин, и конкретный логин внутри него.
  expect(event?.actor).toContain(`seller:${alfa.seller.id}`);
  expect(event?.actor).toContain('user:');
  expect(event?.payload).toMatchObject({ previousPrice: 18_900, price: 17_500 });
});

test('токен партнёра не открывает ERP по HTTP', async ({ request }) => {
  // Границу проверяем именно запросом: вызов метода в юните доказывает правило,
  // но не доказывает, что маршрут снаружи закрыт тем же правилом.
  await resetDb();
  const alfa = await seedPartner('Альфа');

  const login = await request.post(`${API_BASE}/business/auth/login`, {
    data: { username: alfa.username, password: PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };

  for (const path of ['settings', 'orders?status=created', 'reports/summary']) {
    const denied = await request.get(`${API_BASE}/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(denied.status(), `${path} обязан отказать партнёрскому токену`).toBeGreaterThanOrEqual(401);
    expect(denied.status()).toBeLessThan(500);
  }
});

test('неверный пароль не пускает и не подсказывает, что логин существует', async ({ page }) => {
  await resetDb();
  const alfa = await seedPartner('Альфа');

  await page.goto('/business');
  await page.getByLabel('Логин').fill(alfa.username);
  await page.getByLabel('Пароль').fill('неверный-пароль');
  await page.getByRole('button', { name: 'Войти' }).click();

  // Читаем сообщение только после того, как оно появилось: без ожидания тест
  // ловил пустую строку и сравнивал её с текстом второй попытки.
  const alert = page.getByRole('alert').first();
  await expect(alert).toHaveText(/\S/);
  const knownLogin = await alert.textContent();

  await page.getByLabel('Логин').fill('такого-логина-нет');
  await page.getByLabel('Пароль').fill('неверный-пароль');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(alert).toHaveText(/\S/);
  const unknownLogin = await alert.textContent();

  // Разные сообщения превратили бы форму входа в справочник подключённых
  // магазинов: перебором логинов видно, какие учётки существуют.
  expect(knownLogin).toBe(unknownLogin);
  await expect(page.getByRole('heading', { name: 'Вход магазина' })).toBeVisible();
});

test('кнопка «Показать» не наезжает на текст пароля', async ({ page }) => {
  // Кнопка лежит поверх поля абсолютом, а место под неё поле резервирует
  // правым padding'ом. Связи между этими двумя числами нет никакой, и на
  // проде разъехалось: padding 64px против кнопки 66px + отступ 8px, то есть
  // длинный пароль уезжал под кнопку. Меряем оба числа, а не смотрим глазами.
  await resetDb();
  await page.goto('/business');
  await page.getByLabel('Пароль').fill('пароль-достаточно-длинный-чтобы-дойти-до-кнопки');

  const overlap = async () =>
    page.evaluate(() => {
      const field = document.getElementById('business-password') as HTMLInputElement;
      const toggle = Array.from(document.querySelectorAll('button')).find((b) =>
        /Показать|Скрыть/.test(b.textContent ?? ''),
      )!;
      const f = field.getBoundingClientRect();
      const t = toggle.getBoundingClientRect();
      return { reserved: parseFloat(getComputedStyle(field).paddingRight), needed: t.width + (f.right - t.right) };
    });

  const hidden = await overlap();
  expect(hidden.reserved, `под кнопку нужно ${hidden.needed}px, поле резервирует ${hidden.reserved}px`).toBeGreaterThanOrEqual(hidden.needed);

  // «Скрыть» короче «Показать», но проверяем оба: правку легко сделать под
  // одну надпись и не заметить, что вторая всё ещё не помещается.
  await page.getByRole('button', { name: 'Показать' }).click();
  const shown = await overlap();
  expect(shown.reserved, `под кнопку нужно ${shown.needed}px, поле резервирует ${shown.reserved}px`).toBeGreaterThanOrEqual(shown.needed);
});
