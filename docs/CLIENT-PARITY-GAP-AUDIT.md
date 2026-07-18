# Client / Storefront / POS Parity Audit (non-ERP)

**Назначение:** непересекающийся с Codex срез Phase 3. Codex владеет ERP-модулями
(`docs/ERP-DESIGN-GAP-AUDIT.md`, активно правит `apps/web/components/erp/*`). Этот документ
ведёт parity **клиентских, сторефронт и POS** экранов до 1:1 с дизайном.

**Источники правды (design):**
- `design_handoff_alistore/screens/AliStore Клиент App 2.0.dc.html` — клиентское приложение (каталог→корзина→кабинет)
- `design_handoff_alistore/screens/AliStore POS 2.0.dc.html` — касса
- `design_handoff_alistore/screens/AliStore Клиент сервисы.dc.html` — сравнение, рефералы, устройства, адреса, Q&A
- `design_handoff_alistore/screens/AliStore Юридическое.dc.html` — PII-согласие КР, рассрочка-договор, проверка возраста/личности
- `design_handoff_alistore/docs/Native Design System.md` §4 (состояния) / §5 (тёмная тема)

**Метод:** 6 слоёв (цвет, типографика, отступы/радиусы, layout, интерактив, данные/API) +
обязательные состояния §4: Empty / Loading / Error / Success / Permission на каждом экране.

## Design → code карта (эта зона)

| Design screen | Code route / components | Зона |
|---|---|---|
| Клиент App 2.0 | `app/app` → `components/mobile/MobileHome/Catalog/Cart/Favorites/Product/Search/Profile`; `app/catalog`, `app/product/[id]`, `app/cart`, `app/checkout`, `app/search`, `app/favorites` | клиент/сторефронт |
| Клиент сервисы | `app/compare`, `app/account/devices`, `app/account/addresses`, `app/account/bonuses`, `app/account/returns`, `app/account/warranty/[imei]` | клиент |
| POS 2.0 | `app/pos` → `components/pos/PosCatalog/PosCheckout/PosTicket/ServicePosPayment` | касса |
| Юридическое | `app/oferta`, `app/privacy`, checkout consent (`e2e/checkout-consent.spec.ts`) | клиент/legal |
| Trade-in / Гарантия | `app/trade-in`, `app/assess`, `app/warranty`, `components/WarrantyCertificate/Request` | клиент |

## Инвентарь фич дизайна (для сверки с кодом)

**POS 2.0:** Новая продажа · Поиск/скан штрихкода · Добавьте товары (empty) · Скидка % ·
Подытог/Скидка/Итого · Оплата (способ, **разделить чек**) · Внесено / Осталось · К оплате ·
Завершить продажу · Продажа завершена (success) · Отмена/Очистить.

**Клиент App 2.0:** Вход (телефон/соц/Telegram/WhatsApp) · Каталог (НОВИНКА/В НАЛИЧИИ/ЛУЧШАЯ ЦЕНА
бейджи) · Загрузка товаров… (loading) · Корзина / Корзина пуста (empty) · Доставка 1–2 ч ·
Комментарий курьеру · Бонусы и купоны / уровни (GOLD, «До Platinum осталось …») · Мои устройства
(IMEI, Гарантия до) · Гарантийный талон · Возврат товара (выбор из заказа) · Trade-in оценка ·
Адреса доставки · Контакты · История заказов · Избранное.

## Prioritized worklist (для исполнения на resume)

Порядок: сверять экран → фиксировать гэпы по 6 слоям + §4 состояния → закрывать правками
(переиспользуя `components/ui` примитивы), tsc + dev-server визуальная сверка на конкретном
роуте (роут компилируется независимо от красного `/erp`), один экран = один коммит.

1. **POS** (`app/pos`) — самый изолированный, Codex-free. Сверить split-tender (разделить чек),
   Внесено/Осталось, состояние «Продажа завершена», скидочные лейблы.
2. **Client App состояния §4** — Empty (Корзина пуста, нет избранного), Loading (Загрузка товаров…
   → `Skeleton` примитив), Error на каталоге/продукте.
3. **Клиент сервисы** — сравнение, устройства (IMEI/гарантия), адреса, купоны/уровни лояльности.
4. **Юридическое** — PII-согласие КР в checkout, договор рассрочки, проверка возраста.
5. **Trade-in / Гарантия** — оценка, гарантийный талон, поток возврата.

## Блокеры (объективные, не автономно устранимые)

- **Owner:** 64 из 74 связанных `.dc.html` отсутствуют (`docs/acceptance/DESIGN-CORPUS-BLOCKER.md`);
  strict ecosystem-аудит остаётся red, пока владелец не восстановит/ретайрит. Инженерия не фабрикует.
- **Concurrency:** пока Codex активно правит `erp/*`, полный `next build` / `visual:e2e` могут быть
  временно красными из-за его незавершённых правок — верифицировать non-ERP роуты через dev-server
  пороутно.
