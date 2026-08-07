# AI EXECUTIVE ROADMAP (P0–P4)

## P0 — Reliability

- Поднять production readiness для auth/registration и App Store критических путей
- Закрыть блокеры: Apple Sign in web/serviceId, revocation ключи, env secret sync
- Верифицировать production smoke и rollback pipeline
- Цель: безопасный и воспроизводимый релиз

## P1 — Metrics and Owner Cockpit

- Unified owner cockpit в Web: KPIs по заказам, платежам, инвентарю, support
- Ежедневные сводные event-агрегаты + мониторинг ошибок
- Риск-мониторинг по auth churn, отказам доставки, failed payments

## P2 — AI Agents

- Развернуть AI уровни L0–L5 с policy engine
- Ввести approval workflow для financial и operational critical actions
- Создать audit-полку для каждого `ai.*` action и reasoned output

## P3 — Telegram and Camera Gateway

- Стабильный Telegram control plane и двусторонние команды
- Camera gateway для EZVIZ/ONVIF/RTSP с минимальной автоматикой инцидентов и инвентарём полок
- Политика retention и privacy-by-design для видео/детектов

## P4 — Digital Twin, Franchise, Agent Marketplace

- Цифровой twin витрины/склада с AI-предсказаниями
- Формализация модельки мультифраншизы
- AI-агенты на уровне операций для автоматизации повторяющихся решений

## Definition of Done

- Каждый P-блок закрывается только после:
  - unit coverage
  - integration checks
  - e2e (включая отказоустойчивые сценарии)
  - security + RBAC review
  - rollback confirmed

## Текущее состояние (вход по состоянию на 2026-08-07)

- Кодовая база: P0-подготовка завершена по локальному уровню
- Прод и App Store: блокеры на внешней инфраструктуре (Apple/CF/review readiness)
- Следующий шаг: production rollout + physical Apple login check + ответа на review
