import { expect, test, type Page } from '@playwright/test';

/**
 * Упавший каталог обязан выглядеть как сбой, а не как пустой магазин.
 *
 * Это не гипотетический сценарий: прод находится в нём прямо сейчас — API
 * отвечает 502, и покупатель на витрине видел ровно то же, что видит владелец
 * магазина без товаров, «Каталог обновляется». Ни объяснения, ни повтора, ни
 * намёка, что это неполадка на нашей стороне. Человек уходит.
 *
 * Спек глушит каталог и требует от каждой покупательской поверхности сказать
 * правду. Пустой каталог проверяется отдельным ассертом: тексты обязаны
 * различаться, иначе разведение состояний ничего не стоит.
 */

const CATALOG = '**/api/catalog/products*';
/**
 * Главная берёт товары из двух источников: витринного контента
 * (`/storefront/content`) и, если тот пуст, из каталога. Глушить нужно оба,
 * иначе подборка магазина закроет собой упавший каталог и тест ничего не
 * проверит. Блоки живут на третьем адресе — `/storefront-blocks/public`.
 */
const STOREFRONT = '**/api/storefront/**';
const STOREFRONT_BLOCKS = '**/api/storefront-blocks/**';

interface Surface {
  name: string;
  path: string;
  mobile?: boolean;
}

const SURFACES: Surface[] = [
  { name: 'главная', path: '/' },
  { name: 'главная (мобильная)', path: '/', mobile: true },
  { name: 'избранное', path: '/favorites' },
  { name: 'сравнение', path: '/compare' },
  { name: 'Telegram-оболочка', path: '/tg' },
];

async function killCatalog(page: Page): Promise<void> {
  for (const pattern of [CATALOG, STOREFRONT, STOREFRONT_BLOCKS]) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: '{"message":"сервер недоступен"}' }),
    );
  }
}

for (const surface of SURFACES) {
  test(`${surface.name}: сбой каталога показан как сбой, а не как пустой магазин`, async ({ page }) => {
    await page.setViewportSize(surface.mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 });
    await killCatalog(page);
    await page.goto(surface.path);

    const failure = page.getByRole('alert').filter({ hasText: /Не удалось загрузить/ });
    await expect(failure.first()).toBeVisible({ timeout: 20_000 });
    await expect(failure.first().getByRole('button', { name: /Повторить/ })).toBeVisible();

    // Тексты пустого состояния не должны появляться на месте сбоя: именно их
    // покупатель и видел раньше вместо сообщения о неполадке.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Каталог обновляется');
    expect(body).not.toContain('Ничего не найдено');
  });
}

test('кнопка повтора действительно перезапрашивает данные', async ({ page }) => {
  // Считаем по витринному контенту, а не по каталогу: главная идёт за ним
  // первым, и при его отказе до каталога очередь не доходит вовсе.
  let attempts = 0;
  await page.route(STOREFRONT, async (route) => {
    attempts += 1;
    await route.fulfill({ status: 502, contentType: 'application/json', body: '{"message":"сервер недоступен"}' });
  });
  for (const pattern of [CATALOG, STOREFRONT_BLOCKS]) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: '{"message":"сервер недоступен"}' }),
    );
  }

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const failure = page.getByRole('alert').filter({ hasText: /Не удалось загрузить/ }).first();
  await expect(failure).toBeVisible({ timeout: 20_000 });

  await failure.getByRole('button', { name: /Повторить/ }).click();
  // Повтор обязан сходить на сервер заново — кнопка, которая только прячет
  // сообщение, обманывает ровно так же, как молчание.
  await expect.poll(() => attempts, { timeout: 15_000 }).toBeGreaterThan(1);
});
