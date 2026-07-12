# AliStore design conformance

`design_handoff_alistore/` is the visual and interaction source of truth for the
ecosystem. The desktop customer storefront additionally has an explicit complete
reference at `/Users/alistore/Desktop/Новая папка 3/Новая папка/alistore strategy/alistore-shop.html`.
It takes precedence over storefront styling inferred from mobile Client tokens.
The tracked handoff copy is synchronized from `/Users/alistore/Desktop/design_handoff_alistore`.
Prototype HTML is a reference, not production code to embed or copy verbatim.

## Non-negotiable tokens

- Brand: Coral `#FF5B2E`, Deep `#E8410F`, Ink `#201B17`.
- Neutral: Sand `#F7F2EC`, Tint `#FFEFE7`, dark surfaces `#16130F` and `#0E0C0A`.
- Dark-screen action: Lime `#C6FF3D` with `#14110E` text.
- Type: Sora for display, Golos Text for interface copy, JetBrains Mono for money,
  SKU, IMEI, statuses and events.
- Radius: cards 14-22px, buttons 10-13px, 4px spacing grid.
- Required states: loading, empty, error, success and permission denied.

## Platform rule

| Surface | Reference | Theme | Status |
|---|---|---|---|
| Desktop storefront | `alistore-shop.html` | Light gray/white + Ink + coral accent | Complete customer purchase, account, order, device, warranty and self-service contour aligned |
| Client mobile | `AliStore Клиент App 2.0.dc.html` | Dark warm black + Coral/Lime | Existing web reference aligned; native parity ongoing |
| POS | `AliStore POS 2.0.dc.html` | Always dark + Lime action | Functional shell exists; pixel pass pending |
| Staff | `AliStore Сотрудник App 2.0.dc.html` | Always dark + role states | Functional shell exists; pixel pass pending |
| ERP | `AliStore ERP 2.0.dc.html` plus module prototypes | Always dark, dense sidebar workspace | Core shell close; module-by-module pass pending |
| iOS/Android | `Native Design System.md` | Shared brand, native platform controls | Foundations exist; screen parity ongoing |

## Acceptance

Every UI change is accepted only after production build, desktop/mobile browser
screenshots, overflow checks, relevant flow tests and comparison with its `.dc.html`
screen. Do not introduce a new palette, typography scale or interaction model when
the handoff already specifies one.
