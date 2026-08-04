# План: витрина `apps/web` — семь находок (5.1–5.7)

Семь срезов, каждый = один коммит. Порядок ниже — порядок исполнения.
Единственный статический гейт в репо — `tsc`. ESLint/Prettier нет.

## Гейты (сверено по коду)

| Гейт | Где запускается | Вывод |
|---|---|---|
| `npm run build -w @alistore/web` | CI (`.github/workflows/ci.yml:71`), `mvp-verify.mjs:26`, `docker/web.Dockerfile` | **надёжный барьер** |
| `npm run e2e` (Playwright) | CI (`ci.yml:75`), `mvp-verify.mjs:45` | **надёжный барьер** |
| `npm run test -w @alistore/web` (vitest) | **нигде** | мёртвый груз, 8 файлов |

Playwright поднимает web с `NEXT_PUBLIC_API_BASE=http://127.0.0.1:4200/api`
(`playwright.config.ts` webServer), значит **серверные фетчи в e2e работают**.
Это делает Playwright правильным носителем acceptance для SSR/метаданных.

vitest оживляется один раз в Срезе 2 (там же и первый настоящий unit-тест).

---

### Срез 1 — checkout: сорванный `Promise.all` больше не запирает оформление

**Зависит от:** ничего.

**Acceptance:** `e2e/web-checkout.spec.ts`, новый тест
`'сбой сверки цен не запирает кнопку «Далее»'`.
Утверждает: при `page.route('**/api/catalog/products/*', route => route.fulfill({ status: 500, body: '{}' }))`
и посеянной корзине (образец — `e2e/web-checkout.spec.ts:24-26`:
`addInitScript` → `localStorage.setItem('alistore.cart.v1', …)`, плюс
`localStorage.removeItem('alistore.cart.pricing.v1')`) страница `/checkout`
через ≤10 c показывает кнопку `Далее` в состоянии **enabled**, текст
«Проверяем актуальные цены и остатки…» исчезает, и появляется видимое
предупреждение о том, что цены не сверены.
Товар для корзины — `seedProduct()` из `e2e/helpers.ts:143`.

**Файлы:**
- `apps/web/app/checkout/page.tsx:154-163` → у `Promise.all(...).then(...)`
  добавить `.catch()`. В `catch`: `if (!active) return;` →
  `setCartRefreshing(false)` **и** `setCartStaleWarning(true)`.
- `apps/web/app/checkout/page.tsx:106` → рядом с
  `const [cartRefreshing, setCartRefreshing] = useState(true)` добавить
  `const [cartStaleWarning, setCartStaleWarning] = useState(false)`;
  сбрасывать в `false` в начале эффекта (там же, где `setCartRefreshing(true)`).
- `apps/web/app/checkout/page.tsx:477` → рядом со строкой «Проверяем актуальные
  цены и остатки…» отрисовать при `cartStaleWarning` предупреждение:
  «Не удалось сверить остатки и цены — оформление продолжится по данным
  корзины». Класс — как у соседа по строке 472 (`text-xs text-coral-tint`).
- Кнопка `Далее` (`:478`) — **не трогать** список `disabled`: `cartRefreshing`
  уже станет `false`.

**Переиспользовать:**
- `components/LoadFailure.tsx` — **не подходит**: у него `onRetry` обязателен и
  он рисует крупный блок-`role="alert"`, а здесь оформление продолжается.
  Достаточно inline-`<p>` в стиле `:472`.
- Отдельные `.catch(() => …)`-хвосты в этом же файле (`:147`, эффект адресов) —
  образец тона.

**НЕ делать:** не переводить `fetchProduct` на «мягкий отказ» (возврат `null`
вместо throw) — от него зависит `ProductClient` и различение
«нет товара» / «сервис лёг». Не добавлять авто-ретрай. Не блокировать
оформление при провале сверки.

---

### Срез 2 — единый реестр внутренних маршрутов + robots/sitemap + барьер сборки

**Зависит от:** ничего. Готовит почву для host-разделения в `proxy.ts`.

#### Где жить списку

`apps/web/route-visibility.json` — **данные, а не код**, потому что у списка три
потребителя в двух модульных системах:

| Потребитель | Как читает |
|---|---|
| `app/robots.ts`, `app/sitemap.ts`, `proxy.ts` (TS/ESM) | `import` — `tsconfig.json` уже с `"resolveJsonModule": true` |
| `next.config.mjs` (чистый ESM, вне TS) | `readFileSync` + `JSON.parse` |
| Playwright-спека (TS) | `import` |

TS-модуль (`lib/routes.ts`) не годится: `next.config.mjs` его не импортирует без
транспиляции, а барьер обязан жить именно в конфиге (см. ниже).

Форма файла:
```json
{
  "internalPrefixes": ["/admin", "/erp", "/pos", "/staff", "/warehouse", "/approvals", "/refunds", "/courier", "/courier-cash", "/ai-tools", "/exchange", "/assess", "/b2b", "/warranty", "/account", "/order"],
  "publicSegments": ["about", "app", "cart", "catalog", "checkout", "compare", "delivery", "favorites", "login", "oferta", "privacy", "product", "search", "support", "tg", "trade-in"],
  "sitemapRoutes": [
    { "path": "/", "changeFrequency": "daily", "priority": 1 },
    { "path": "/catalog", "changeFrequency": "daily", "priority": 0.9 },
    { "path": "/about", "changeFrequency": "monthly", "priority": 0.5 },
    { "path": "/delivery", "changeFrequency": "monthly", "priority": 0.6 },
    { "path": "/trade-in", "changeFrequency": "weekly", "priority": 0.6 },
    { "path": "/support", "changeFrequency": "monthly", "priority": 0.5 }
  ]
}
```
Классификация спорных: `/exchange`, `/assess`, `/b2b`, `/warranty`, `/refunds`,
`/courier*`, `/ai-tools`, `/approvals` — внутренние (все они за
`StaffSessionLogin`/ERP-оболочкой, см. `e2e/web-route-audit.spec.ts:32-48`, где
`/ai-tools`, `/approvals`, `/refunds` уже перечислены как
`authenticatedShellRoutes`). `/cart`, `/favorites`, `/compare`, `/login` —
публичны, но **уходят из sitemap**: это персональные/транзакционные экраны без
индексируемого содержимого. `/checkout`, `/search`, `/tg`, `/app`, `/oferta`,
`/privacy` — публичны, вне sitemap (или добавить `/oferta`, `/privacy` с
priority 0.2, если владелец захочет).

#### Барьер

`apps/web/next.config.mjs`, в начале файла — синхронная проверка, бросающая
`Error` при рассинхроне:
```js
// читаем route-visibility.json + fs.readdirSync('app', { withFileTypes: true })
// сегменты = каталоги без '(' , '@', '_' и без '[' в имени;
// каждый сегмент обязан быть либо в publicSegments,
// либо префиксом из internalPrefixes; иначе throw с именем сегмента
// и подсказкой «добавьте /<segment> в internalPrefixes или publicSegments».
```
Это роняет `next build` → а он в CI (`ci.yml:71`), в `mvp-verify.mjs:26` и в
`docker/web.Dockerfile`. Новая back-office страница без записи в реестре
сборку не переживёт. Проверка обязана: игнорировать `api`, `healthz`,
`.well-known`, файлы (`page.tsx`, `layout.tsx`, `robots.ts`, …) и route-группы.

Альтернативы, отвергнутые: (а) vitest-тест — сам по себе не гейт;
(б) шаг в `mvp-verify.mjs` — CI его не запускает, он вызывает шаги поштучно;
(в) Playwright — гейт настоящий, но обратная связь через 4 минуты подъёма
Postgres+API вместо 2 секунд.

**Acceptance:**
1. `e2e/web-route-audit.spec.ts`, новый тест
   `'robots.txt закрывает все внутренние префиксы, sitemap.xml их не содержит'`.
   Утверждает: `GET /robots.txt` → тело содержит `Disallow: <prefix>` для
   **каждого** элемента `internalPrefixes` (импортированного из
   `route-visibility.json`, не переписанного руками); `GET /sitemap.xml` →
   не содержит ни одного `<loc>` с внутренним префиксом, не содержит
   `/assess`, `/cart`, `/favorites`, `/compare`, `/login`, и содержит `/catalog`.
2. `apps/web/lib/routes.test.ts` (vitest), тест
   `'isInternalPath распознаёт вложенные пути и не ловит префикс-однофамильцев'`.
   Утверждает: `isInternalPath('/erp/orders') === true`,
   `isInternalPath('/erp') === true`, `isInternalPath('/b2b') === true`,
   `isInternalPath('/catalog') === false`, и — ловушка — некий
   `/exchanged-goods` не считается внутренним из-за `/exchange`
   (сопоставление по границе сегмента: `p === prefix || p.startsWith(prefix + '/')`).
3. Барьер проверяется руками один раз: временно создать
   `app/__barrier_probe__/page.tsx`, убедиться что `npm run build -w @alistore/web`
   падает с внятным сообщением, удалить. В коммит проба не идёт.

**Оживление vitest (обязательная часть среза, иначе п.2 декоративен):**
- `scripts/mvp-verify.mjs:26` → сразу **перед** `['Web build', …]` вставить
  `['Web unit tests', 'npm', ['run', 'test', '-w', '@alistore/web']]`.
- `.github/workflows/ci.yml:71` → перед `- run: npm run build -w @alistore/web`
  вставить `- run: npm run test -w @alistore/web`.
- Прогнать все 8 существующих vitest-файлов до правок и починить/зафиксировать
  красное. Если что-то из восьми красное и чинится не за 15 минут — **не**
  чинить в этом срезе: вынести в `BACKLOG.md` и добавить шаг только после
  зелени, иначе срез утонет.
- `vitest.config.ts` в `apps/web` нет; дефолтный include ловит `**/*.test.ts`.
  Тест обязан быть чистой логикой: jsdom и `@testing-library` не установлены,
  рендер компонентов невозможен.

**Файлы:**
- `apps/web/route-visibility.json` → новый.
- `apps/web/lib/routes.ts` → новый: `import data from '@/route-visibility.json'`,
  экспорт `INTERNAL_PREFIXES`, `SITEMAP_ROUTES`, `isInternalPath(pathname)`.
- `apps/web/app/robots.ts:5` → `PRIVATE_PREFIXES` (8 элементов) заменить на
  `INTERNAL_PREFIXES` из `@/lib/routes`.
- `apps/web/app/sitemap.ts:11-27` → `STATIC_ROUTES` заменить на `SITEMAP_ROUTES`;
  комментарий-список внутренних путей (`:8-9`) заменить ссылкой на реестр
  (комментарий врёт при каждой новой странице — самостоятельная находка).
- `apps/web/next.config.mjs:1-5` → добавить барьер.
- `scripts/mvp-verify.mjs`, `.github/workflows/ci.yml` → см. выше.

**Переиспользовать:** `lib/site.ts` (`SITE_URL`) — уже верный, не трогать.
`e2e/web-route-audit.spec.ts` — там уже есть `systemRoutes` c `/robots.txt` и
`/sitemap.xml` (`:50-56`), тест ложится рядом.

**НЕ делать:** в этом срезе **не трогать** `proxy.ts` — host-разделение это
отдельный срез, он просто импортирует `isInternalPath`. Не удалять `/order` и
`/account` из `internalPrefixes` (они уже там де-факто). Не менять статус-коды.
Не добавлять `noindex`-мету на внутренние страницы — это работа host-среза.

---

### Срез 3 — `images.remotePatterns`: первое фото из ERP не должно ронять страницу

**Зависит от:** ничего.

**Acceptance:** `e2e/storefront-cms-ui.spec.ts` (или новый
`e2e/storefront-remote-media.spec.ts`), тест
`'товар с абсолютным https-фото рендерится без Invalid src prop'`.
Утверждает: продукт засеян через `seedProduct` + `prisma` с
`attrs.imageUrl = 'https://media.ali.kg/probe.jpg'`; страница `/product/<id>`
загружается, `page.on('pageerror')` не собрал ни одной ошибки со словом
`Invalid src prop`, и `img[alt="<имя>"]` присутствует в DOM с `src`,
содержащим `/_next/image`.
Ловушка для джуниора: `media.ali.kg` в e2e не резолвится — картинка **не
загрузится** (broken image), это нормально. Утверждать надо отсутствие
исключения и наличие узла, а не `naturalWidth > 0`.

**Файлы:**
- `apps/web/next.config.mjs` → в `nextConfig` добавить блок:
  ```js
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.ali.kg' },
      { protocol: 'https', hostname: '**.ali.kg' },
    ],
    // при NEXT_PUBLIC_MEDIA_HOST — добавлять его же, чтобы staging не падал
  },
  ```
  Точный список хостов **уточнить у владельца** до кодирования: медиа-хост
  сейчас нигде в репозитории не зафиксирован (см. «Чего не смог проверить»).
- Проверить, что покрыты все 6 мест с оптимизированным `next/image` и
  внешним `src`: `components/ProductCard.tsx:74`,
  `components/mobile/MobileProductCard.tsx:51`,
  `components/mobile/MobileProduct.tsx:78` и `:300`,
  `components/mobile/MobileFavorites.tsx:58`,
  `app/compare/page.tsx:104`, `app/product/[id]/ProductClient.tsx:201`, `:216`.
  Все они получают `src` из `productImage()` (`components/ProductCard.tsx:24`),
  который пропускает `https://`-URL (`validMediaUrl`, `:13-15`).

**Переиспользовать:** `productImage` / `productImages` /`validMediaUrl` — уже
правильные, менять не нужно. `MobileHome.tsx:54` уже обходит проблему через
`unoptimized` — это работающий, но неоптимальный дубль решения; после среза
`unoptimized` там можно снять (**необязательно**, отдельным коммитом).

**НЕ делать:** не ставить `images: { unoptimized: true }` глобально — это
выключит оптимизацию и для локальных плейсхолдеров. Не разрешать
`hostname: '**'` — открытый прокси-оптимизатор чужих картинок. Не трогать
`<img>` героя на `app/page.tsx:69` — он намеренно не `next/image` (см. Срез 6).

---

### Срез 4 — `openGraph` и `metadataBase` в корневом layout

**Зависит от:** ничего. Идёт до Среза 5, чтобы `generateMetadata` товара
наследовал базу и мог задавать только дельту.

**Acceptance:** `e2e/web-route-audit.spec.ts`, тест
`'главная отдаёт og:*, twitter:card и canonical в серверном HTML'`.
Утверждает: `const html = await (await request.get('/')).text()` — да, именно
`request`, а не `page`, чтобы проверить **HTML до гидратации**; в нём есть
`property="og:title"`, `og:description`, `og:image`, `og:url`, `og:type`,
`og:locale` со значением `ru_RU`, `og:site_name`, `name="twitter:card"` и
`<link rel="canonical" href="…ali.kg/">`.

**Файлы:**
- `apps/web/app/layout.tsx:13-21` → в `metadata` добавить:
  `metadataBase: new URL(SITE_URL)` (импорт из `@/lib/site`),
  `alternates: { canonical: '/' }`,
  `openGraph: { type: 'website', locale: 'ru_RU', siteName: 'AliStore',
   url: '/', title, description, images: [{ url: '/banner-hero.png',
   width: …, height: …, alt: … }] }`,
  `twitter: { card: 'summary_large_image' }`.
  `public/banner-hero.png` существует — **прочитать его реальные размеры**
  (`sips -g pixelWidth -g pixelHeight`) и подставить, а не выдумать.
- `apps/web/lib/site.ts` — не менять.

**Переиспользовать:** `lib/site.ts:SITE_URL`, `public/banner-hero.png`.

**НЕ делать:** не добавлять `robots` в корневой metadata (это работа `robots.ts`
и host-среза). Не заводить второй источник заголовка — `title`/`description`
уже в `layout.tsx:14-17`, переиспользовать их, не копировать строки.

---

### Срез 5 — `generateMetadata` для товара: заголовок, og, canonical, JSON-LD в HTML

**Зависит от:** Срез 4 (`metadataBase`).

#### Годится ли `lib/api/catalog.ts` для серверного вызова — да, с тремя оговорками

1. **Базовый URL.** `API_BASE` (`lib/api/http.ts:14-35`) на сервере вычисляется
   один раз при загрузке модуля: `NEXT_PUBLIC_API_BASE` → иначе ветка
   self-heal **не срабатывает** (`typeof window === 'undefined'`) → падение в
   `http://localhost:4000/api`. В проде переменная задаётся на этапе сборки
   (`docker/web.Dockerfile:14,17`, `render.yaml:62`), в e2e — из
   `playwright.config.ts` webServer. Значит серверный фетч рабочий **везде,
   где мы его проверяем**, но `next build && next start` без переменной даст
   тихий localhost. Это существующий риск, в этом срезе не чиним — записать
   строкой в `BACKLOG.md`.
2. **`cache`.** Оба фетчера ходят с `cache: 'no-store'`
   (`catalog.ts:220`, `:276`) — верно для страницы, которая уже
   `export const dynamic = 'force-dynamic'` (`app/product/[id]/page.tsx:3`).
   Ничего менять не надо, но и на кэш Next рассчитывать нельзя.
3. **`fetchProductWithRelated` держит модульный `Map`-кэш промисов на 30 c**
   (`catalog.ts:253-272`). В браузере это на вкладку; **на сервере это
   процесс-глобальный кэш, общий для всех посетителей**. Данные публичные
   (карточка товара), утечки персональных данных нет, но: (а) карточка может
   быть до 30 c устаревшей для всех сразу, (б) `Map` неограниченно растёт.
   Для серверного пути этого достаточно, отдельный фикс не нужен —
   но **записать в `BACKLOG.md`** как «модульный кэш каталога живёт в
   серверном процессе».

#### Как получить товар на сервере без двойного запроса и без слома гидратации

```
app/product/[id]/page.tsx  (server)
  const getDetail = cache((id) => fetchProductWithRelated(id))   // React cache
  generateMetadata({params}) → getDetail(id)   ─┐ один и тот же промис
  Page({params})             → getDetail(id)   ─┘ в пределах одного запроса
  → <ProductPage params={{id}} initialDetail={detail} />
```
- `import { cache } from 'react'` — это дедуплицирует `generateMetadata` и
  рендер страницы **в один сетевой запрос**. Без него будет два (модульный
  30-секундный кэш из п.3 их тоже склеит, но опираться на побочный эффект
  чужого кэша нельзя).
- Клиентский дубль убирается пробросом `initialDetail` в `ProductClient`:
  - `ProductClient.tsx:37-39` → начальное состояние
    `useState(initialDetail ? (initialDetail.product ?? 'missing') : null)`,
    и так же для `similar` (`detail.related`) и `variants`.
  - `ProductClient.tsx:49-68` → в начале эффекта:
    `if (initialDetail) { /* только дозагрузить отзывы */ }`. Отзывы
    (`fetchProductReviews`) **оставить клиентскими** — они не нужны в мете и
    не влияют на первый экран.
  - Гидратация не ломается, потому что начальное состояние клиента буквально
    равно тому, из чего сервер отрисовал HTML. Ловушка: `initialDetail`
    должен быть сериализуемым — `ProductWithRelated` это простой JSON, годится.
  - Итог: **1 серверный запрос** вместо «0 серверных + 1 клиентский», плюс
    отзывы. Карточка появляется в первом HTML — заодно чинится и невидимость
    JSON-LD (`ProductClient.tsx:104-137` теперь попадает в исходный ответ).

#### 404 и сбой API внутри `generateMetadata`

| Случай | `generateMetadata` | `Page` |
|---|---|---|
| `product === null` (API отдал 404, либо id не CUID — `catalog.ts:262`) | вернуть `{ title: 'Товар не найден — AliStore', robots: { index: false } }` | `notFound()` → настоящий HTTP 404 |
| `CatalogUnavailableError` (5xx/сеть) | **поймать**, вернуть минимум: дефолтный `title`, `alternates.canonical: /product/<id>`, `robots: { index: false }`, без `openGraph.images` | **не** вызывать `notFound()`; отрисовать `<ProductPage params={{id}} />` без `initialDetail` — клиент сам сходит и покажет свой экран «Товар временно недоступен» (`ProductClient.tsx:83-92`) с кнопкой повтора |

Два правила, которые джуниор обязан не нарушить:
- **`generateMetadata` не должна бросать.** Проброшенное исключение поднимет
  error boundary и превратит секундный сбой API в 500 на карточке товара.
  Обернуть в `try/catch`, в `catch` вернуть минимальную мету.
- **`notFound()` только на `product === null`.** Вызвать его на сбое API значит
  сказать поисковику «товара не существует» из-за перезагрузки бэкенда.
- Для `app/product/[id]/page.tsx` нужен `not-found.tsx` (или наследуется
  глобальный) — проверить, что 404 выглядит не как белый экран.

#### Что кладём в мету товара

`title: '<name> — купить в Бишкеке | AliStore'`, `description` — из
`attrs.description`, обрезанной до ~160 символов, иначе собранная из
`name + category + цена` (`som()` из `lib/format.ts`);
`alternates.canonical: '/product/<id>'`;
`openGraph: { type: 'website', url, title, description, images:
[productImage(product)] }` — `productImages()` из `components/ProductCard.tsx:17`
работает и на сервере (чистая функция, без хуков), но **импорт из
`'use client'`-модуля в серверный файл тянет клиентскую границу**: вынести
`validMediaUrl` / `productImages` / `productImage` в `lib/product-media.ts`
и реэкспортировать из `ProductCard.tsx`, чтобы существующие импорты не сломались.
`og:image` метаданных **не проходит через `next/image`**, поэтому от Среза 3
не зависит.

**Acceptance:** `e2e/web-route-audit.spec.ts` (или новый
`e2e/product-metadata.spec.ts`), два теста:
1. `'карточка товара отдаёт имя товара в <title>, og:* и canonical в HTML до JS'` —
   `seedProduct()`, затем `request.get('/product/' + id)`, в тексте ответа:
   `<title>` содержит имя товара; есть `og:title` с именем; `og:type`;
   `<link rel="canonical" href="…/product/<id>">`; есть
   `"@type":"Product"` (JSON-LD теперь в серверном HTML).
2. `'несуществующий товар отвечает 404, а не 200'` —
   `request.get('/product/clzzzzzzzzzzzzzzzzzzzzzzz')` (валидный по форме CUID,
   которого нет) → `response.status() === 404`.
   Внимание: `/product/__route_audit_missing__` в
   `e2e/web-route-audit.spec.ts:27` сейчас ждёт «здоровый» ответ — этот
   существующий тест придётся поправить, id там не-CUID и по
   `catalog.ts:262` даёт `product: null` → тоже станет 404. Решить осознанно:
   либо ожидать 404 и там, либо убрать строку из `anonymousRoutes`.

**Файлы:**
- `apps/web/app/product/[id]/page.tsx:1-7` → `generateMetadata`, `cache()`,
  `notFound()`, проброс `initialDetail`.
- `apps/web/app/product/[id]/ProductClient.tsx:33-68` → новый проп
  `initialDetail?: ProductWithRelated`, seed-состояние, пропуск первого фетча.
- `apps/web/lib/product-media.ts` → новый (перенос `validMediaUrl`,
  `productImages`, `productImage` из `components/ProductCard.tsx:13-26`).
- `apps/web/components/ProductCard.tsx:13-26` → удалить тела, реэкспортировать
  из `@/lib/product-media` (импортов по репозиторию 7+, ломать нельзя).
- `apps/web/e2e/web-route-audit.spec.ts:27` → см. выше.

**Переиспользовать:** `lib/api/catalog.ts` (`fetchProductWithRelated`,
`CatalogUnavailableError`), `lib/site.ts`, `lib/format.ts` (`som`),
`e2e/helpers.ts` (`seedProduct`), `metadataBase` из Среза 4.

**НЕ делать:** не превращать `ProductClient` в серверный компонент — он держит
`useCart`/`useFavorites`/`useCompare`/`useAuth`. Не убирать
`export const dynamic = 'force-dynamic'` и не пытаться в этом срезе
`generateStaticParams` — это ISR-решение, отдельный разговор. Не переносить
загрузку отзывов на сервер. Не удалять клиентский JSON-LD — он теперь просто
рендерится на сервере тем же кодом.

---

### Срез 6 — главная: один фетч на два зеркала + хиро в первом HTML

**Зависит от:** Срез 5 (образец «серверная обёртка + `initialX` в клиента»
должен уже стоять в репозитории).

Один срез закрывает 5.5 (главная) и 5.6, потому что это одно и то же
изменение: перестать быть `'use client'` на верхнем уровне.

Форма:
```
app/page.tsx            (server, async, dynamic = 'force-dynamic')
  ├ параллельно: fetchStorefrontContent()
  │              fetchPublicStorefrontBlocks('desktop')
  │              fetchPublicStorefrontBlocks('mobile')
  │              fetchCatalog(...) — только если featuredProducts пуст
  ├ <div className="md:hidden"><MobileHome initial={…mobile} /></div>
  └ <div className="hidden md:block"><HomeDesktop initial={…desktop} /></div>
```
- Было: 3 клиентских фетча × 2 ветки = **6 запросов из браузера**
  (`app/page.tsx:35-44` и `components/mobile/MobileHome.tsx:29-38`).
  Станет: 3–4 серверных запроса, 0 клиентских на первом рендере.
- Хиро (`app/page.tsx:69`): `storefront` больше не стартует `null`, ветка
  `heroImageUrl ? … : …` разрешается **на сервере** →
  `<img … loading="eager" fetchPriority="high">` появляется в исходном HTML и
  становится обнаружим препарсером. Это и есть фикс LCP. Дополнительно —
  `<link rel="preload" as="image" href={heroImageUrl} fetchpriority="high">`
  через `ReactDOM.preload` или `<link>` в серверной разметке.
- Ошибки: серверные фетчеры `fetchStorefrontContent`/`fetchPublicStorefrontBlocks`
  уже отдают мягкий отказ (`try/catch` внутри, `lib/api/storefront.ts:32`,
  `lib/api/storefront-blocks.ts:31`), `fetchCatalog` — `source: 'unavailable'`
  (`isCatalogUnavailable`). Серверная обёртка **не должна бросать**: собрать
  `initial = { storefront, blocks, products | null, loadError }` и отдать вниз.
  `LoadFailure` + `reloadToken` в клиентских компонентах **сохранить** —
  они обслуживают повторную попытку после серверного отказа.

**Acceptance:** новый `e2e/storefront-ssr.spec.ts`, два теста:
1. `'хиро и подборка приходят в серверном HTML, без ожидания JS'` —
   `const html = await (await request.get('/')).text()`; утверждает, что в
   тексте есть заголовок героя (значение `heroTitle` из посеянного
   storefront-контента, либо дефолт `'Техника с гарантией'`) **и** имя
   посеянного товара; если задан `heroImageUrl` — в HTML есть
   `fetchpriority="high"` (в сериализованном HTML атрибут в нижнем регистре —
   искать регистронезависимо).
2. `'главная делает не больше двух запросов к каталогу/витрине из браузера'` —
   `page.on('request')` с фильтром по `/api/storefront` и `/api/catalog`,
   `page.goto('/')`, `waitForLoadState('networkidle')`, ожидать `<= 2`
   (запас на клиентские дозагрузки вроде избранного). До правки будет 6 —
   тест обязан сначала упасть.

**Файлы:**
- `apps/web/app/page.tsx:1` → снять `'use client'`, сделать `async` серверный
  компонент; строки `27-51` (весь `useState`/`useEffect`-блок) уезжают в
  `apps/web/app/HomeDesktop.tsx`.
- `apps/web/app/HomeDesktop.tsx` → новый `'use client'`: вся текущая
  desktop-разметка (`app/page.tsx:57-110` и хвост файла) + `initial`-пропсы
  вместо `useEffect`; `LoadFailure`/`reloadToken` сохранить.
- `apps/web/components/mobile/MobileHome.tsx:22-45` → принять
  `initial: { storefront, blocks, products, loadError }`, эффект оставить
  только как ретрай по `reloadToken > 0`.
- `apps/web/app/page.tsx:69` → хиро остаётся `<img>` (комментарий на `:67-68`
  честен: CMS-хост произвольный); при желании после Среза 3 перевести на
  `next/image priority` — **не в этом срезе**.

**Переиспользовать:** `lib/api/storefront.ts`, `lib/api/storefront-blocks.ts`,
`lib/api/catalog.ts`, `components/LoadFailure.tsx`, образец разделения
«сервер фетчит → клиент рисует» из Среза 5.

**НЕ делать:** не переводить `MobileHome` в серверный компонент — там
`Stagger`/`Pressable` из `components/motion/primitives` и `useCart`. Не
удалять двойное монтирование через CSS (`md:hidden`/`hidden md:block`) — это
отдельное архитектурное решение (SSR не знает ширину экрана); срез убирает
дубль **запросов**, а не дубль разметки. Не менять `fetchPublicStorefrontBlocks`
API. Не трогать `app/catalog/page.tsx` — Срез 7.

---

### Срез 7 — каталог: подъём фетча из двух зеркал в родителя

**Зависит от:** Срез 6 (тот же приём, тот же тест-паттерн).

**Acceptance:** `e2e/storefront-ssr.spec.ts`, тест
`'каталог делает один запрос списка товаров на первую отрисовку'` —
`page.on('request')` по `**/api/catalog?*`, `page.goto('/catalog')`,
`waitForLoadState('networkidle')` → ровно 1 (сейчас 2: `app/catalog/page.tsx:36`
и `components/mobile/MobileCatalog.tsx:31`). Плюс проверка, что фильтры
по-прежнему работают: клик по категории меняет число товаров.

**Файлы:**
- `apps/web/app/catalog/page.tsx:1` → серверная обёртка: читает
  `searchParams` (`q`, `category`), делает `fetchCatalog` + `fetchCatalogCategories`,
  отдаёт `initial` в `CatalogDesktop` и `MobileCatalog`.
- `apps/web/app/catalog/CatalogDesktop.tsx` → новый `'use client'` из текущего
  тела `app/catalog/page.tsx:13-…`; `useEffect` (`:32-40`) остаётся для
  **последующих** фильтраций (debounce 250 мс сохранить), но пропускает
  первый прогон, если `initial` совпадает с текущими параметрами.
- `apps/web/components/mobile/MobileCatalog.tsx:25-31` → принять `initial`,
  убрать первичный фетч, оставить эффект для смены фильтров.
- Начальные `q`/`category` сейчас читаются из `window.location.search`
  (`app/catalog/page.tsx:26-27`, `MobileCatalog.tsx:26`) — заменить на
  `searchParams` из серверного пропа; это заодно убирает мигание фильтра
  на первом кадре.

**Переиспользовать:** тот же приём и те же фетчеры, что в Срезе 6.

**НЕ делать:** не переносить состояние фильтров в URL в этом срезе (это
улучшение, но оно меняет UX и заслуживает своего). Не убирать debounce.
Не трогать `isCatalogUnavailable`-ветки — они правильные.

---

## Порядок и риск

| Срез | Риск | Почему такой порядок |
|---|---|---|
| 1 | низкий | самый прямой вред покупателю, изолирован |
| 2 | средний (оживление vitest может вскрыть красное) | ничего не блокирует, но даёт барьер для всех дальнейших |
| 3 | низкий | одна строка конфига, но нужен ответ владельца про медиа-хост |
| 4 | низкий | предпосылка для 5 |
| 5 | **высокий** | меняет модель загрузки карточки и статус-коды 404 |
| 6 | **высокий** | переписывает главную |
| 7 | средний | повтор приёма из 6 |

Срезы 5–7 — по одному коммиту с отдельным прогоном
`npm run e2e` и `npx tsc --noEmit -p apps/web/tsconfig.json`.
После каждого — запись в `PROGRESS.md`, отложенное — в `BACKLOG.md`
(новый changelog не заводить).

## Чего не смог проверить

1. **Реальный медиа-хост.** `media.ali.kg` — из формулировки задачи, в
   репозитории он не встречается: ни в `render.yaml`, ни в
   `apps/api/.env.production.example`, ни в конфиге загрузки медиа. Точный
   `hostname` (и нужен ли CDN-хост отдельно) для Среза 3 надо подтвердить у
   владельца, иначе `remotePatterns` окажется мимо.
2. **Зелень восьми существующих vitest-файлов.** Не запускал (только чтение).
   Если хоть один красный, шаг в CI из Среза 2 сломает пайплайн — см. оговорку
   в срезе.
3. **Фактический LCP-элемент.** Lighthouse/трейс не гонял; вывод про хиро
   сделан из кода (`app/page.tsx:69` внутри ветки по `storefront`, который
   стартует `null`). Возможно, реальный LCP — заголовок `<h1>`, тогда выигрыш
   Среза 6 будет от SSR текста, а не картинки; сам фикс от этого не меняется.
4. **Как ведёт себя `unoptimized`-`Image` в `MobileHome.tsx:54`** без
   `remotePatterns` — по документации Next оптимизатор и его валидация хоста
   пропускаются, но экспериментально не подтверждал.
5. **Точные размеры `public/banner-hero.png`** (нужны для `og:image` в Срезе 4)
   — файл не открывал.
6. **`app/product/[id]/not-found.tsx`** — существует ли подходящий fallback
   для 404 из Среза 5; в каталоге видел только `page.tsx`, `ProductClient.tsx`,
   `loading.tsx`, глобальный `not-found` не искал.
7. **Совместимость с host-срезом.** `proxy.ts` сейчас проверяет только
   `ALLOWED_HOSTS` и отдаёт 421; как именно host-срез будет отличать
   `admin.ali.kg` от апекса — не мой срез, я лишь фиксирую, что реестр из
   Среза 2 должен быть его единственным источником списка путей.
