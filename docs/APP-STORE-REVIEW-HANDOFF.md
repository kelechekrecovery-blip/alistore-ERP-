# App Store Review handoff после отказов 30.07.2026

Этот документ заменяет снимок от 27.07.2026. Он не утверждает текущий статус
версий в App Store Connect: перед каждым действием владелец обязан перечитать
статус приложения и сообщение App Review в веб-интерфейсе.

Приложения:

| Приложение | Bundle ID | Выбранная аудитория |
|---|---|---|
| AliStore KG | `kg.alistore.client` | публичные покупатели AliStore |
| AliStore Staff | `kg.alistore.staff` | ограниченная аудитория сотрудников, Unlisted |
| AliStore Courier | `kg.alistore.courier` | ограниченная аудитория курьеров, Unlisted |
| AliStore POS | `kg.alistore.pos` | ограниченная аудитория кассиров, Unlisted |

Полный журнал решения, ответы и критерии остановки:
[`APP-STORE-REJECTION-REMEDIATION-2026-07-30.md`](./APP-STORE-REJECTION-REMEDIATION-2026-07-30.md).

## 1. Что сообщил App Review

- **AliStore KG — Guideline 2.1(a), Performance — App Completeness.**
  Ревьюер не смог войти через Sign in with Apple на iPad Air 11-inch (M3),
  iPadOS 26.5.2, при активном интернете, build `1.0.0 (4)`.
- **AliStore Staff — Guideline 3.2, Business.** Apple определила приложение как
  предназначенное для конкретной организации, её партнёров, клиентов или
  сотрудников, хотя в App Store Connect выбрана публичная дистрибуция.
- **AliStore Courier и AliStore POS — Guideline 2.1, Information Needed.**
  Ревьюер не смог войти с предоставленными demo credentials.

Здесь приведено только безопасное резюме сообщений. Логины, пароли, телефоны,
одноразовые коды, имена и контактные данные в репозиторий не переносятся.

## 2. Источник текста для App Review Notes

Перед копированием в App Store Connect использовать только поле
`review.appReviewNotes` из соответствующего файла:

- `apps/ios/store/client-metadata.json`;
- `apps/ios/store/staff-metadata.json`;
- `apps/ios/store/courier-metadata.json`;
- `apps/ios/store/pos-metadata.json`.

Staff, Courier и POS больше не описываются как SaaS для любого магазина или как
multi-tenant платформа. Текущая правдивая формулировка: это ролевые ресурсы для
ограниченной аудитории сотрудников AliStore, предназначенные для **Unlisted App
distribution**. У них нет публичной регистрации.

## 3. Доступ ревьюера

### AliStore KG

1. В поля **Demo Account** в App Store Connect внести выделенный review-телефон
   и фиксированный review-код. Значения не вставлять в Notes, документы, issue,
   чат или Git.
2. С чистой сессии проверить, что эти два значения дают вход без доставки SMS и
   без обращения к поддержке.
3. Серверная проверка Sign in with Apple исправлена: разрешённая аудитория
   включает native bundle ID и web Services ID, при этом подпись, issuer,
   audience, expiration и nonce продолжают проверяться.
4. Это серверная remediation, а не доказательство физического device QA.
   Отдельно проверить Sign in with Apple на review-equivalent iPad. До записи
   такого результата не отвечать Apple, что device QA завершён.

### AliStore Staff, Courier и POS

Для каждого приложения отдельно:

1. В Demo Account fields внести активную ограниченную review-учётку нужной роли.
2. Проверить точное совпадение credential, `active=true`, правильную роль,
   доступную рабочую точку и отключённый TOTP для review-учётки.
3. Выполнить вход с чистой установки/сессии через production API.
4. Проверить минимум один ожидаемый экран после входа.
5. Проверить данные роли:
   - Staff — доступный рабочий заказ или задача;
   - Courier — назначенная review-доставка;
   - POS — доступный каталог и требуемое состояние смены.

До прохождения этих проверок App Review Notes не утверждают, что данные были
засеяны или что workflow полностью доступен.

После завершения review выделенные учётки деактивируются, а временные
Client-review настройки удаляются с сервера.

## 4. Unlisted distribution для Staff, Courier и POS

Unlisted начинается с метода **Public**. Для этого пути не переключать приложение
на **Private/Custom App**.

Для каждого из трёх приложений:

1. В **App Store Version Release** выбрать ручной release, чтобы исключить
   случайную публичную публикацию до решения по Unlisted.
2. В **Pricing and Availability → App Distribution Methods** оставить
   **Public**.
3. Вставить актуальный `review.appReviewNotes`.
4. Исправить и проверить Demo Account fields.
5. Добавить версию в review и отправить/переотправить её в App Review.
6. После того как версия отправлена, подать отдельный
   [Unlisted App Request](https://developer.apple.com/contact/request/unlisted-app/)
   для конкретного App Store Connect app record.
7. Ответить в App Review, что приложение предназначено для ограниченной
   employee-аудитории и запрос Unlisted подан.
8. Не выпускать приложение, пока **Pricing and Availability** явно не показывает
   **Unlisted**.

Apple описывает этот порядок в
[Unlisted App Distribution](https://developer.apple.com/support/unlisted-app-distribution/)
и
[Set distribution methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods).

Если поле Notes заблокировано текущим статусом, сначала удалить/отменить
submission, затем обновить Notes, повторно отправить ту же валидную сборку и
подать Unlisted request. Новый binary нужен только если Apple укажет binary defect.

## 5. Что перепроверить перед Resubmit

- demo sign-in проходит у каждого приложения из чистой сессии;
- Client fixed review code не требует SMS или сообщения владельцу;
- Client Sign in with Apple проверен на review-equivalent iPad либо ответ честно
  ограничен серверной remediation;
- role data существует и читается соответствующей review-учёткой;
- Staff/Courier/POS release удерживается вручную;
- в Notes нет утверждений `subscribing store`, `any electronics store`,
  `multi-tenant` или непроверенных обещаний seeded data;
- для Staff/Courier/POS подан отдельный Unlisted request;
- Demo Account и review contact заполнены только в App Store Connect;
- App Privacy и privacy policy не изменены без нового privacy-аудита.

## 6. Проверенный статус на 30.07.2026

- Review Notes во всех четырёх отклонённых версиях синхронизированы с
  `apps/ios/store/*-metadata.json`; Demo Account и контактные поля при этом не
  изменялись.
- Production API отвечает на health-check, а malformed Apple identity token
  доходит до Apple verifier и отклоняется как `apple_token_invalid`, а не как
  отсутствующая конфигурация provider.
- Нативные unit-тесты Apple Sign-In прошли: nonce, request payload и обработка
  server error.
- Read-only `npm run ios:review-readiness` подтвердил соответствие ASC
  конфигурации для всех четырёх приложений, затем остановился на Staff:
  reviewer account входит, но назначенные задачи отсутствуют.
- Resubmit остаётся заблокированным. Нельзя обходить gate ослаблением проверки
  или повышением review-пользователя до глобальной роли: в текущей модели нет
  tenant isolation, поэтому такая роль может раскрыть реальные операционные
  данные.
- Courier delivery, POS shift и review-equivalent physical iPad QA должны быть
  подтверждены до Resubmit; отсутствие этих PASS нельзя заменять текстом в
  Notes.

## 7. Rollback и stop conditions

- Если Unlisted request отклонён — не возвращать выдуманный public-SaaS narrative.
  Оставить версию невыпущенной и выбрать между Custom App и контролируемым
  TestFlight-доступом.
- Если Custom App рассматривается как fallback — сначала доказать, что организация
  может получать приложения через Apple Business. После approval переход между
  Public и Private требует нового app record.
- Если employee-приложение случайно стало публично доступным до Unlisted approval —
  немедленно убрать его из availability и написать App Review.
- Если любая demo-учётка не входит или не показывает заявленный workflow —
  остановить Resubmit, исправить данные/доступ и повторить gate.
- Если Sign in with Apple снова не работает на review-equivalent iPad — не
  представлять server fix как полную remediation; нужен новый диагностический цикл.
