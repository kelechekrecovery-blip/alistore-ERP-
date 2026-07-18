# AliStore design conformance

`design_handoff_alistore/` is the visual and interaction source of truth for the
ecosystem. Since 2026-07-18 the canonical latest corpus is Design 3.0 from
`/Users/alistore/Desktop/AliStore интернет магазин архитектура/handoff` and is
mirrored into `design_handoff_alistore/screens/`. The 3.0 files take precedence
over older 2.0/legacy screens whenever both exist.

The desktop customer storefront additionally has an explicit complete reference
at `/Users/alistore/Desktop/Новая папка 3/Новая папка/alistore strategy/alistore-shop.html`.
It takes precedence over storefront styling inferred from mobile Client tokens.
Prototype HTML is a reference, not production code to embed or copy verbatim.

## Non-negotiable tokens

- Brand: Coral `#FF5B2E`, Deep `#E8410F`, Ink `#201B17`.
- Neutral: Sand `#F7F2EC`, Tint `#FFEFE7`, dark surfaces `#16130F` and `#0E0C0A`.
- Dark-screen action: Lime `#C6FF3D` with `#14110E` text.
- Type: Sora for display, Golos Text for interface copy, JetBrains Mono for money,
  SKU, IMEI, statuses and events.
- Radius: cards 14-22px, buttons 10-13px, 4px spacing grid.
- Required states: loading, empty, error, success and permission denied.

## Design 3.0 additions

- ERP/POS/operations use dense glass surfaces over a warm near-black stage.
- High-signal actions use coral `#FF7A4D` to `#E8410F`; operational confirmation remains lime.
- KPI strips, search, notification and AI controls use the same glass treatment.
- Ambient backgrounds remain restrained and must not obscure text, controls or data.
- Native apps keep platform navigation and accessibility while matching the same brand tokens.

## Platform rule

| Surface | Reference | Theme | Status |
|---|---|---|---|
| Desktop storefront | `alistore-shop.html` | Light gray/white + Ink + coral accent | Complete customer purchase, account, order, device, warranty and self-service contour aligned |
| Client mobile | `AliStore Клиент App 3.0.dc.html` | Dark warm black + Coral/Lime | Latest corpus synced; native parity ongoing |
| POS | `AliStore POS 3.0.dc.html` | Always dark + Lime action | Latest corpus synced; pixel pass pending |
| Staff | `AliStore Сотрудник App 2.0.dc.html` | Always dark + role states | Functional shell exists; pixel pass pending |
| ERP | `AliStore ERP 3.0.dc.html` plus module prototypes | Always dark, dense glass sidebar workspace | 3.0 shell pass started; module-by-module pass pending |
| iOS/Android | `Native Design System.md` | Shared brand, native platform controls | Foundations exist; screen parity ongoing |

## Acceptance

Every UI change is accepted only after production build, desktop/mobile browser
screenshots, overflow checks, relevant flow tests and comparison with the applicable
Design 3.0 `.dc.html` screen. Do not introduce a new palette, typography scale or
interaction model when the handoff already specifies one.
