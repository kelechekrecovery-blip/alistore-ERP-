# AI EXECUTIVE BASELINE

| Область | Статус | Доказательство | Риск | Следующий шаг |
|---|---|---|---|---|
| Auth | PARTIAL | Локальные unit/e2e покрытия для login/registrations обновлены и зелёные; живой прод endpoint сейчас не проверен целиком | В проде не подтверждён свежий rollout | Деплой API и worker из последнего релизного коммита, затем live smoke `auth methods`, login и logout |
| Registration | PARTIAL | Локальные сценарии регистрации (email/phone/social-first) в API и Playwright проходят | Признак `socialFirstSignupEnabled` на проде не подтверждён после rollout | Верифицировать prod `GET /api/auth/methods` и выполнить live регистрацию |
| RBAC | PARTIAL | Ключевые проверки ролей/доступа покрыты тестами, включая staff-сессии | Нет подтверждения RBAC в проде с реальными ролями | Прогнать role-gated smoke по owner/admin/staff/courier после деплоя |
| Orders | MISSING | Полный заказной путь не проходит как end-to-end в production | Риск деградации в `order.created` и статусах доставки | Добавить интеграционный e2e заказа и включить в release criteria |
| Payments | PARTIAL | Базовые payment-потоки покрыты в API, но без отдельного production readiness smoke | Риск неидемпотентного платежного поведения при перегрузках | Добавить explicit `payment.authorized` и `payment.failed` smoke |
| Inventory | PARTIAL | Схема и базовые операции на уровне API есть, но нет финального prod smoke | Риск потери согласованности складских остатков | Ввести проверку `inventory.changed` на продуктиве |
| Delivery | MISSING | Нет полного e2e chain от создания заказа до обновления статуса доставки | Риск блокировки courier-потока и SLA | Добавить delivery e2e с `delivery.delayed` и откликом менеджера |
| Support | PARTIAL | Каналы поддержки и тикетинг реализованы, но без production smoke | Риск невидимости инцидентов в живом usage | Проверить создание и эскалацию тикетов в проде |
| AI | PARTIAL | AI control plane реализован; уровни L0-L5 описаны, но production approval/rollback пока не прогнаны | Риск выполнения действий без нужного контроля | Пройти e2e по ai events + approval center + policy engine |
| Telegram | PARTIAL | Команды и шаблоны интеграции реализованы в коде и документах | Нет финальной верификации webhook с продовым ботом | Проверить продовые Telegram-интенты и callback обработку |
| Cameras | BLOCKED_EXTERNAL | Интеграция EZVIZ/ONVIF/RTSP отмечена как целевая, но runtime-обвязка не закрыта | Зависит от внешней инфраструктуры камер и доступа | Подготовить secure camera gateway и отдельный блок P2 |
| iOS | PARTIAL | Локальные сборки и юниты успешны; физический login в production не подтверждён | Риск повторного отказа App Review по Apple login | Дождаться продового rollout и выполнить ручную проверку на устройстве |
| Web | PARTIAL | Web auth flows локально зелёные, но Apple web service config не активен в проде | Риск несоответствия `kg.alistore.web` / redirect config | Проверить Services ID + key и запустить `web-apple-login` на https://ali.kg/login |
| E2E | PARTIAL | Локальные suites по auth/login/registration/teleгram проходят | Нет production smoke и стабильных e2e после rollout | Зафиксировать production smoke suite и запускать после каждого релиза |
| Security | PARTIAL | Сильные проверки по auth/session, gitleaks/immutable snapshot пройдены в worker; revocation config ещё не активен в проде | Риск внешнего блокера по Apple revocation config | Установить Apple и секреты, затем повторный hardening run |
| App Store | BLOCKED_EXTERNAL | Build6 в ASC валиден, была rejection по Guideline 2.1(a) (Apple sign in) | Без подтверждённого production Apple login риск повторного отказа | После prod rollout выполнить физическую проверку, подготовить и отправить ответ |

