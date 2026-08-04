# Council Decision

## Scope

Mode: quick

Решение охватывает только App Store remediation для AliStore KG, Staff, Courier и POS. Изменение binary, API, скриптов, deployment и внешнего состояния исключено.

## Decision

Status: REVISE

Summary: AliStore KG остаётся публичным customer-приложением и повторно подаётся только после проверки фиксированного review-входа и честного описания серверной Sign in with Apple remediation. Staff, Courier и POS позиционируются как ограниченные employee resources AliStore и направляются в Unlisted distribution. Публичный SaaS narrative отклонён как не подтверждённый продуктовой моделью.

| Candidate | Factual support | Policy fit | Operational fit | Decision |
|---|---|---|---|---|
| Защищать public multi-store SaaS | Low | Low после 3.2 | Не требует нового distribution flow | Reject |
| Unlisted для Staff/Courier/POS | High | High для limited employee audience | Работает на managed и unmanaged devices | Choose |
| Private Custom Apps | High | Very high | Требует доказанной Apple Business distribution | Conditional fallback |

**Response drafts — не отправлены.** Оставлять утверждения о PASS и поданном request только после выполнения соответствующего acceptance gate; credentials и PII не добавлять.

**AliStore KG — Guideline 2.1(a)**

> Thank you for the review details. We corrected the server-side Sign in with Apple audience validation so the native app bundle identifier is accepted in addition to the web Services ID, while signature, issuer, allowed audience, expiration and nonce validation remain enforced. We also placed a dedicated phone and fixed review code in the Demo Account fields; this deterministic path does not require SMS delivery or contacting us. We verified the review path described above. No customer credential is included in these notes.

Добавлять утверждение о повторной проверке Sign in with Apple на iPad только после документированного PASS.

**AliStore Staff — Guideline 3.2**

> Thank you for the clarification. Our earlier notes overstated the app's general availability. AliStore Staff is an authenticated employee resource for a limited AliStore operational audience, has no public registration and is intended for Unlisted App distribution. We submitted the corresponding Unlisted App request and kept the app from public release while it is pending. The active demo account is supplied only in the Demo Account fields.

**AliStore Courier and AliStore POS — Guideline 2.1**

> Thank you for reporting the demo sign-in issue. We replaced and reverified the limited-purpose review account for this app from a clean session against the production service. The active username and matching credential are supplied only in the Demo Account fields; there is no SMS or TOTP step. This app is a limited AliStore employee resource intended for Unlisted App distribution, and the corresponding request has been submitted.

## Confidence

Level: medium

Reason: Точные безопасные резюме четырёх отказов предоставлены из App Review, а repository evidence и официальные правила Apple проверены. Live-статусы, фактические demo credentials, Unlisted requests и device QA не читались и не изменялись в этой работе.

## Evidence

- VERIFIED: AliStore KG отклонён по Guideline 2.1(a), Performance — App Completeness: App Review не смог войти через Sign in with Apple на iPad Air 11-inch (M3), iPadOS 26.5.2, build `1.0.0 (4)`, при активном интернете.
- VERIFIED: AliStore Staff отклонён по Guideline 3.2, Business: приложение признано предназначенным для конкретной организации или её сотрудников при выбранной публичной дистрибуции.
- VERIFIED: AliStore Courier и AliStore POS получили Guideline 2.1, Information Needed: App Review не смог войти с предоставленными demo credentials.
- VERIFIED: `StaffUser` связан с `StorePoint`, но schema не содержит `Tenant`, `Organization` или `Merchant`, подтверждающих публичную multi-tenant SaaS модель (`apps/api/prisma/schema.prisma`, модели `StorePoint` и `StaffUser`).
- VERIFIED: Server-side Apple authentication проверяет JWKS signature, issuer, allowed audience, expiration и nonce (`apps/api/src/auth/social-login.ts`).
- VERIFIED: Тест server remediation принимает native bundle ID и web Services ID, но отклоняет постороннюю аудиторию (`apps/api/test/social-auth.spec.ts`).
- VERIFIED: Apple называет employee resources и limited employee/partner audiences кандидатами для Unlisted distribution: https://developer.apple.com/support/unlisted-app-distribution/
- VERIFIED: Для Unlisted приложение сохраняет Public distribution method до одобрения запроса; переход Public↔Private после approval требует нового app record: https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods
- ASSUMPTION: Сборка `1.0.0 (4)` не содержит отдельного binary defect помимо наблюдавшегося reviewer sign-in.
- UNKNOWN: Текущие ASC status и release option каждого app record после отказов.
- UNKNOWN: Фактическая готовность demo-учёток и role data.
- UNKNOWN: Результат физической проверки Sign in with Apple на review-equivalent iPad.

## Blockers

- UNKNOWN: Владелец должен подтвердить successful clean-session login всеми четырьмя review-учётками непосредственно перед Resubmit.
- UNKNOWN: Владелец должен подтвердить role data для Staff, Courier и POS; до этого нельзя обещать seeded review data.
- UNKNOWN: Владелец должен подать и получить решение по отдельному Unlisted request для Staff, Courier и POS.

## Dissent

- INFERRED: Private Custom App лучше ограничивает обнаружение и организационный доступ, чем Unlisted.
- VERIFIED: Custom App требует работоспособную Apple Business/School организацию; её наличие и возможность получать apps для текущей организации не подтверждены.
- INFERRED: Поэтому Custom App остаётся fallback, а не текущим выбранным путём.

## Risks

- VERIFIED: Unlisted link не является security control; любой получивший ссылку может скачать приложение, поэтому серверная аутентификация остаётся обязательной.
- INFERRED: Автоматический release до одобрения Unlisted может кратковременно опубликовать employee app для публичного discovery.
- INFERRED: Повторное утверждение, что любой магазин может подписаться, без tenant model, onboarding и tenant-isolation evidence создаёт риск доверия со стороны App Review.
- INFERRED: Исправление server-side Apple audience validation не доказывает successful device-level Sign in with Apple flow.

## Action Plan

### Action: Проверить Client review login

- Owner: Product owner / release manager
- Priority: P0
- Dependencies: Активные значения только в ASC Demo Account fields и соответствующая временная server configuration
- Acceptance: Чистая сессия входит по fixed review phone/code без SMS и обращения к поддержке; отдельный Sign in with Apple test на review-equivalent iPad записан как PASS либо ответ Apple явно ограничен server remediation.
- Rollback: Оставить версию невыпущенной и вернуть submission в исправление.
- Kill criterion: Любой review path требует реального клиента, ручной передачи кода, истёкшего credential или не проходит на review-equivalent device.

### Action: Исправить employee demo access

- Owner: ERP owner / release manager
- Priority: P0
- Dependencies: Активные Staff, Courier и POS review-учётки правильных ролей, TOTP off и доступная рабочая точка
- Acceptance: Каждая учётка входит из чистой сессии через production API и открывает соответствующий первый role screen; Staff видит рабочий объект, Courier — назначенную доставку, POS — каталог и требуемое состояние смены.
- Rollback: Деактивировать нерабочую review-учётку, выдать новую ограниченную учётку только в ASC и повторить gate.
- Kill criterion: Login fail, неверная роль, disabled point, TOTP prompt или отсутствие заявленного role data.

### Action: Перевести Staff, Courier и POS в Unlisted

- Owner: App Store Connect Account Holder / App Manager
- Priority: P0
- Dependencies: Исправленный demo access, актуальные App Review Notes и версия, отправленная в App Review
- Acceptance: Для каждого app record release удерживается вручную, distribution method остаётся Public на время запроса, отдельный Unlisted request подан, а перед release в Pricing and Availability отображается Unlisted.
- Rollback: Не выпускать версию; использовать контролируемый TestFlight либо после проверки доступности создать Custom App path.
- Kill criterion: Apple отклонила Unlisted request, app стал публично доступен до Unlisted approval или reviewer снова классифицирует narrative как public SaaS.

### Action: Ответить App Review

- Owner: App Manager
- Priority: P0
- Dependencies: Соответствующий acceptance gate реально прошёл
- Acceptance: Ответ отправлен только после проверки фактов, не содержит credentials или PII и не заявляет device QA или seeded data без доказательства.
- Rollback: Сохранить draft, не отправлять и вернуть блокирующий gate владельцу.
- Kill criterion: Draft содержит credential, PII, неподтверждённый PASS, `subscribing store`, `any electronics store` или multi-tenant claim.

## Verification

- VERIFIED: Четыре JSON metadata-файла синтаксически валидны и прошли локальные metadata validators.
- VERIFIED: Council report прошёл `.agents/skills/alistore-project-council/scripts/validate_report.py`.
- VERIFIED: Изменения ограничены четырьмя metadata-файлами и двумя назначенными документами; scripts/code не редактировались.
- UNKNOWN: Никакое действие в App Store Connect, Unlisted request, production login или physical-device QA в этой работе не выполнялись.
- VERIFIED: После council-среза Review Notes четырёх отклонённых версий обновлены через App Store Connect API без изменения Demo Account и contact attributes.
- VERIFIED: Production health-check проходит, native и web Apple audiences загружены в launchd, а malformed identity token отклоняется кодом `apple_token_invalid`.
- VERIFIED: Нативные Apple Sign-In unit-тесты прошли, 7/7.
- VERIFIED: Read-only review readiness gate подтвердил ASC-конфигурацию всех четырёх приложений и успешный Staff login, затем остановил релиз из-за отсутствия назначенных Staff-задач.
- UNKNOWN: Courier delivery, POS shift и physical-device Apple Sign-In QA ещё не имеют подтверждённого PASS; до этого Resubmit запрещён.
- UNKNOWN: Отдельные Unlisted requests для Staff, Courier и POS ещё не поданы.

## Deferred Questions

- UNKNOWN: Подтверждает ли владелец долгосрочно, что Staff, Courier и POS предназначены только для ограниченной operational-аудитории AliStore?
- UNKNOWN: Кто и когда выполнит review-equivalent iPad QA для Sign in with Apple?
- UNKNOWN: Поддерживает ли организация Apple Business получение Custom Apps, если Apple отклонит Unlisted?
