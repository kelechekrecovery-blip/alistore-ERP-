# Design corpus retire proposal

Status: `owner-signature-required`

Date: 2026-07-18

Related: `docs/acceptance/DESIGN-CORPUS-BLOCKER.md`, `BACKLOG.md` entries `ECO-001` / `ECO-001A`.

## Кратко для владельца

64 связанных дизайн-файла `.dc.html` не найдены нигде на этом Mac и в истории git —
восстановить их инженерия не может, а выдумывать ссылки запрещено контрактом. Ниже —
точный список всех 64 файлов и что каждый покрывал. Предлагаемая диспозиция по умолчанию:
`retire` (снять ссылки) для всех 64. Вы можете изменить диспозицию любой строки на
`restore` (вернёте оригинал) или `replace` (дадите новый handoff). Достаточно подписать
блок «Owner decision» в конце — инженерия применит решение и закроет красный гейт.

## Recovery search performed on 2026-07-18 (read-only)

| Search | Scope | Result |
|---|---|---|
| `mdfind -name '.dc.html'` and `mdfind "kMDItemFSName == '*.dc.html'"` | whole Spotlight index | 46 hits = the same 23 present files in `alistore-erp` and its `alistore-erp-meta` worktree; 0 of the 64 missing names |
| `find` for `*.dc.html` | `~/.Trash`, `/tmp`, `~/Downloads`, `~/Documents`, `~/Desktop`, `~/Library/Mobile Documents` (iCloud), `~/Library/CloudStorage` | only the 23 present files in the meta worktree |
| full `find` | `/Users/alistore`, `/opt`, `/usr/local`, `/tmp`, `/private/tmp` | 0 hits outside the two project directories |
| git history | `git log --all --diff-filter=D -- '*.dc.html'`, all branches and both worktrees, stash | no `.dc.html` was ever deleted; only 2 commits ever touched `*.dc.html` (they added the 23 present files) |
| renamed copies | `mdfind -name` for 8 distinctive basenames (e.g. "AliStore Cash Shift Closing", "AliStore Event Ledger", "AliStore Сайт") | 0 hits anywhere |
| archives | `~/Downloads/AliStore_Bot_Комплект.zip`, `files.zip`, `ins.zip`, `alistor-system-backup-20260209-214054.tar.gz`, `Hetzner.tar.gz`, `alirore.rar` (contents listed/scanned, not extracted into the repo) | 0 `.dc.html` entries |
| session export dirs | `~/Documents/Codex/2026-*/files-mentioned-by-the-user-*` | only CSV/XLSX, no design files |
| external media | `/Volumes` | only `Macintosh HD`; local APFS snapshots are OS-update snapshots only |

Conclusion: **0 of the 64 missing files are recoverable on this machine.** They were never
committed to git and no copy, rename, or archive containing them exists locally. Recovery
would require media not visible from this Mac (another machine, a USB/backup drive, a
Time Machine destination, cloud design tooling, or the original author).

## Decision requested

For every file below choose exactly one disposition (the blocker contract in
`docs/acceptance/DESIGN-CORPUS-BLOCKER.md`):

- `restore` — you provide the original `.dc.html`; engineering adds it to
  `design_handoff_alistore/screens` unchanged;
- `retire` — you approve removal of the link; engineering records your approval
  reference and ISO timestamp in `docs/acceptance/ecosystem-evidence.json`;
- `replace` — you provide a new approved handoff; engineering documents the superseded
  file.

The proposed default for all 64 rows is `retire`. Edit any row before signing, or sign
as-is to retire all 64.

## The 64 missing linked files

Coverage below is **inferred** from the linking committed handoff and its row in
`docs/ECOSYSTEM-TRACEABILITY-MATRIX.md` plus the file name; it states what the link
pointed at, not verified content. "Linked from" names the committed handoff(s) containing
the broken `href`.

| # | Missing file | Linked from | Covers (inferred) | Routes / surfaces (matrix) | Proposed disposition |
|---|---|---|---|---|---|
| 1 | `AliStore Аналитика воронки.dc.html` | Обзор проекта | Funnel analytics dashboards | `/erp` analytics (Analytics row) | retire |
| 2 | `AliStore Возврат.dc.html` | Обзор проекта | Return flow UI | `/account` returns, `/pos` return, `/erp` (Client services / POS rows) | retire |
| 3 | `AliStore Вход.dc.html` | Обзор проекта | Sign-in / auth screens | storefront + account login, client-app auth (Security row) | retire |
| 4 | `AliStore Долги и рассрочка.dc.html` | Обзор проекта | Customer debts and installments | `/account`, `/erp` finance (Finance row) | retire |
| 5 | `AliStore Изменение остатка.dc.html` | Обзор проекта | Stock-level adjustment | `/warehouse`, `/erp` (Warehouse row) | retire |
| 6 | `AliStore Изменение цены.dc.html` | Обзор проекта | Price-change workflow | `/erp`, `/admin/products` (Product management row) | retire |
| 7 | `AliStore Карта системы.dc.html` | Обзор проекта | System map overview | documentation / cross-surface (Project overview row) | retire |
| 8 | `AliStore Клиент Прототип.dc.html` | Обзор проекта | Client prototype flows | Client iOS/Android (Client App row) | retire |
| 9 | `AliStore Курс урок.dc.html` | Обзор проекта | Training course lesson | HR training, Staff app (HR row) | retire |
| 10 | `AliStore Курьер App.dc.html` | Обзор проекта | Courier app screens | Courier iOS/Android (Logistics row) | retire |
| 11 | `AliStore Курьер Workflow.dc.html` | Логистика управление, Обзор проекта | Courier workflow states | Courier apps, `/erp` logistics (Logistics row) | retire |
| 12 | `AliStore Локализация и тема.dc.html` | Обзор проекта | Localization and theming | all surfaces (Ecosystem row) | retire |
| 13 | `AliStore Обмен товара.dc.html` | Обзор проекта | Product exchange | `/pos`, `/erp` (POS row) | retire |
| 14 | `AliStore Обращения и гарантия.dc.html` | Обзор проекта | Support tickets and warranty | `/account`, `/erp` service (Client services / Service center rows) | retire |
| 15 | `AliStore Обучение сотрудников.dc.html` | Обзор проекта | Staff training | `/erp` HR, Staff app (HR row) | retire |
| 16 | `AliStore Онбординг и состояния.dc.html` | Обзор проекта | Onboarding and UI states | Client apps (Client App row) | retire |
| 17 | `AliStore Перемещения.dc.html` | Обзор проекта | Stock transfers | `/warehouse`, `/erp` (Warehouse row) | retire |
| 18 | `AliStore Платёжная сверка.dc.html` | Обзор проекта | Payment reconciliation | `/erp` finance (Finance row) | retire |
| 19 | `AliStore Презентация.dc.html` | Обзор проекта | Presentation deck | documentation (Project overview row) | retire |
| 20 | `AliStore Продажа в долг.dc.html` | Обзор проекта | Sell-on-credit | `/pos`, `/erp` finance (POS / Finance rows) | retire |
| 21 | `AliStore Резервы.dc.html` | Обзор проекта | Stock reservations | `/erp`, `/warehouse` (Warehouse row) | retire |
| 22 | `AliStore Сайт 2.0.dc.html` | Обзор проекта | Storefront v2 | storefront web (Product management / storefront rows) | retire |
| 23 | `AliStore Сайт.dc.html` | Обзор проекта | Storefront | storefront web (Product management / storefront rows) | retire |
| 24 | `AliStore Сверка кассы.dc.html` | Обзор проекта | Cash-drawer reconciliation | `/pos`, `/erp` finance (POS / Finance rows) | retire |
| 25 | `AliStore Скупка и договор.dc.html` | Обзор проекта, Сотрудник App 2.0 | Buyback and contract | `/staff`, Staff apps (Staff App row) | retire |
| 26 | `AliStore Списание товара.dc.html` | Обзор проекта | Stock write-off | `/warehouse`, `/erp` (Warehouse row) | retire |
| 27 | `AliStore Супер-админ.dc.html` | Обзор проекта | Super-admin console | `/erp` admin (ERP row) | retire |
| 28 | `AliStore Уведомления Outbox.dc.html` | Обзор проекта | Notification outbox | all surfaces (Marketing CMS / Ecosystem rows) | retire |
| 29 | `AliStore Удаление товара.dc.html` | Обзор проекта | Product deletion | `/erp`, `/admin/products` (Product management row) | retire |
| 30 | `AliStore Франшиза.dc.html` | Обзор проекта | Franchise management | `/erp` franchise (ERP row) | retire |
| 31 | `AliStore AI Dev Agent.dc.html` | Обзор проекта | AI dev-agent console | tooling / documentation (Project overview row) | retire |
| 32 | `AliStore Approval Inbox.dc.html` | Обзор проекта | Approval inbox | `/erp` approvals (ERP row) | retire |
| 33 | `AliStore Approval Rules Matrix.dc.html` | Обзор проекта | Approval rules configuration | `/erp` approvals (ERP / Security rows) | retire |
| 34 | `AliStore Campaign ROI.dc.html` | Обзор проекта | Campaign ROI reporting | `/erp` marketing (Marketing CMS row) | retire |
| 35 | `AliStore Cash Shift Closing.dc.html` | Обзор проекта | Cash shift closing | `/pos`, `/erp` (POS row) | retire |
| 36 | `AliStore Cash Shift Opening.dc.html` | Обзор проекта | Cash shift opening | `/pos`, `/erp` (POS row) | retire |
| 37 | `AliStore Command Center.dc.html` | Обзор проекта | Operations command center | `/erp` operations (Store operations row) | retire |
| 38 | `AliStore Courier Cash Handover.dc.html` | Обзор проекта | Courier COD handover | Courier app, `/erp` finance (Logistics / Finance rows) | retire |
| 39 | `AliStore CRM Кампании.dc.html` | ERP 2.0, Обзор проекта | CRM campaigns | `/erp` marketing (Marketing CMS row) | retire |
| 40 | `AliStore Customer 360.dc.html` | Обзор проекта | Customer 360 view | `/erp` CRM (ERP row) | retire |
| 41 | `AliStore Data Migration.dc.html` | Обзор проекта | Data-migration tooling | tooling / documentation (Project overview row) | retire |
| 42 | `AliStore Dispute Center.dc.html` | Обзор проекта | Dispute handling | `/erp` support / finance (Client services / Finance rows) | retire |
| 43 | `AliStore Event Ledger.dc.html` | Обзор проекта | Event Ledger inspector | `/erp` system (Ecosystem row) | retire |
| 44 | `AliStore Evidence Vault.dc.html` | Обзор проекта | Evidence vault | `/erp` service / operations (Service center / Security rows) | retire |
| 45 | `AliStore Failed Delivery.dc.html` | Обзор проекта | Failed-delivery flow | Courier app, `/erp` logistics (Logistics row) | retire |
| 46 | `AliStore Franchise Audit Checklist.dc.html` | Обзор проекта | Franchise audit checklist | `/erp` franchise (ERP row) | retire |
| 47 | `AliStore IMEI реестр.dc.html` | Обзор проекта | IMEI registry | `/erp`, `/warehouse` (Warehouse / Product management rows) | retire |
| 48 | `AliStore IMEI Lifecycle.dc.html` | Обзор проекта | IMEI lifecycle | `/erp`, `/warehouse` (Warehouse row) | retire |
| 49 | `AliStore Incident Recovery.dc.html` | Обзор проекта | Incident recovery | `/erp` operations (Store operations row) | retire |
| 50 | `AliStore Inventory Count.dc.html` | Обзор проекта, Складской учёт | Inventory count | `/warehouse` (Warehouse row) | retire |
| 51 | `AliStore Margin Control.dc.html` | Обзор проекта | Margin control | `/erp` finance / analytics (Finance / Analytics rows) | retire |
| 52 | `AliStore Marketing Segment Builder.dc.html` | Обзор проекта | Marketing segment builder | `/erp` marketing (Marketing CMS row) | retire |
| 53 | `AliStore Notification Preferences.dc.html` | Обзор проекта | Notification preferences | `/account`, client apps (Client services row) | retire |
| 54 | `AliStore Offline POS.dc.html` | Обзор проекта | Offline POS mode | `/pos`, POS apps (POS row) | retire |
| 55 | `AliStore Order Timeline.dc.html` | Обзор проекта | Order timeline | `/account`, `/staff` (Order State Machine row) | retire |
| 56 | `AliStore Payment Ledger.dc.html` | Обзор проекта | Payment ledger | `/erp` finance (Finance row) | retire |
| 57 | `AliStore Refund Money Flow.dc.html` | Обзор проекта | Refund money flow | `/erp` finance, `/pos` (Finance / POS rows) | retire |
| 58 | `AliStore Risk Center.dc.html` | Обзор проекта | Risk center | `/erp` security (Security row) | retire |
| 59 | `AliStore Role Permission Matrix.dc.html` | Обзор проекта | Role/permission matrix | `/erp` admin (Security row) | retire |
| 60 | `AliStore Supplier RMA.dc.html` | Обзор проекта | Supplier RMA | `/erp` procurement (Procurement row) | retire |
| 61 | `AliStore Supplier Scorecard.dc.html` | Закупки, Обзор проекта | Supplier scorecard | `/erp` procurement (Procurement row) | retire |
| 62 | `AliStore Support Inbox.dc.html` | Обзор проекта | Support inbox | `/erp` support (Client services row) | retire |
| 63 | `AliStore Telegram-бот.dc.html` | Обзор проекта | Telegram bot flows | Telegram channel (Logistics / Marketing rows) | retire |
| 64 | `AliStore Warranty Case Detail.dc.html` | Обзор проекта, Сервис-центр | Warranty case detail | `/erp` service (Service center row) | retire |

## Owner decision

- [ ] **Approve retirement of all 64 files as proposed** (or as edited above).
- [ ] Approve with per-row edits (mark edited rows above, then sign).

Approval reference (used verbatim as `ownerApprovalRef`):
`OWNER-DESIGN-CORPUS-RETIRE-2026-07-18`

- Owner name: ______________________
- Signature: ______________________
- Date (ISO 8601): ______________________

## How engineering applies the decision (only after signature)

Nothing has been applied. `docs/acceptance/ecosystem-evidence.json`,
`design_handoff_alistore/screens` and the traceability matrix are untouched by this
proposal. After the owner signs:

1. For each `retire` row, append to `designRetirements` in
   `docs/acceptance/ecosystem-evidence.json`:

```json
{ "file": "<exact file name from the table>", "ownerApprovalRef": "OWNER-DESIGN-CORPUS-RETIRE-2026-07-18", "approvedAt": "<signature date, ISO 8601>" }
```

2. For each `restore` row, copy the owner-supplied original into
   `design_handoff_alistore/screens` without editing its content.
3. For each `replace` row, add the new handoff and record the supersession in the matrix.
4. Re-run `npm run ecosystem:audit:strict` — the design-corpus blocker clears only when
   every missing reference is either present on disk or retired with a valid approval.
5. Update `docs/ECOSYSTEM-TRACEABILITY-MATRIX.md` and `BACKLOG.md` (`ECO-001`,
   `ECO-001A`) with the outcome.

Note: retiring removes the visual-acceptance reference, not the software. Routes whose API,
RBAC, Ledger, E2E and other visual evidence exist keep their own `partial`/`accepted`
status per the blocker contract; they simply can never inherit visual acceptance from a
retired handoff.
