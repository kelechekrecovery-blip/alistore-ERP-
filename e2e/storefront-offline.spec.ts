import { expect, test, type Page } from '@playwright/test';
import { seedProduct } from './helpers';

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
 *
 * Важная оговорка про десктопную главную: она получает первый экран с сервера,
 * а `page.route` перехватывает только браузерные запросы. То есть здесь
 * имитируется не «API лежит», а «браузер до API не достучался, сервер —
 * достучался». Настоящее падение API покрыто по-другому: сервер тогда тоже
 * ничего не получит, отдаст `products: null`, и клиент покажет экран сбоя — тот
 * же путь, что у остальных поверхностей ниже.
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
  /**
   * Первый экран приходит с сервера, а `page.route` глушит только браузер —
   * значит здесь имитируется не «каталог лежит», а «браузер не достучался до
   * API, пока сервер достучался». Требование к такой поверхности другое, но не
   * слабее: она обязана продолжать работать и всё так же не показывать пустоту.
   */
  serverRendered?: boolean;
}

const SURFACES: Surface[] = [
  { name: 'главная', path: '/', serverRendered: true },
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
    // Серверной поверхности нужен хотя бы один товар: иначе «пустой магазин» —
    // честное состояние, и проверять было бы нечего. Сеем явно, чтобы тест не
    // зависел от того, что осталось в базе от соседних спеков.
    if (surface.serverRendered) await seedProduct('OFFLINE-E2E');
    await killCatalog(page);
    await page.goto(surface.path);

    if (surface.serverRendered) {
      // Товары пришли в первичном HTML, поэтому отказ браузерных запросов
      // покупатель вообще не должен заметить. Проверяем именно это, а не
      // придуманный экран сбоя, которого здесь честно нет.
      await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
    } else {
      const failure = page.getByRole('alert').filter({ hasText: /Не удалось загрузить/ });
      await expect(failure.first()).toBeVisible({ timeout: 20_000 });
      await expect(failure.first().getByRole('button', { name: /Повторить/ })).toBeVisible();
    }

    // Общее для всех поверхностей и главное в этом спеке: тексты пустого
    // состояния не должны появляться там, где данных нет. Именно их покупатель
    // и видел раньше вместо правды.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Каталог обновляется');
    expect(body).not.toContain('Ничего не найдено');
  });
}

test('кнопка повтора действительно перезапрашивает данные', async ({ page }) => {
  // Мобильная главная, а не десктопная: десктопная получает первый экран с
  // сервера, поэтому при живом сервере экрана сбоя у неё не возникает и нажимать
  // нечего. Мобильная по-прежнему ходит за данными из браузера — на ней и
  // проверяем, что «Повторить» реально идёт в сеть, а не просто прячет текст.
  //
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const failure = page.getByRole('alert').filter({ hasText: /Не удалось загрузить/ }).first();
  await expect(failure).toBeVisible({ timeout: 20_000 });

  await failure.getByRole('button', { name: /Повторить/ }).click();
  // Повтор обязан сходить на сервер заново — кнопка, которая только прячет
  // сообщение, обманывает ровно так же, как молчание.
  await expect.poll(() => attempts, { timeout: 15_000 }).toBeGreaterThan(1);
});
