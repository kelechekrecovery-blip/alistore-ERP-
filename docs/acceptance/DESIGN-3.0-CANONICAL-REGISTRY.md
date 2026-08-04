# AliStore Design 3.0 Canonical Registry

## Decision

The active AliStore visual system is **Design 3.0**. New implementation work must
use the 3.0 tokens, component primitives and interaction states from this registry.
No route, native screen or ERP module may introduce a new 2.0/light visual branch.

Historical handoffs remain in the repository for traceability. Their presence does
not make them active implementation references.

## Canonical handoffs

| Surface | Active reference |
|---|---|
| Web storefront | `AliStore Сайт 2.0.dc.html` replacement, registered as Design 3.0 |
| ERP shell | `AliStore ERP 3.0.dc.html` |
| POS | `AliStore POS 3.0.dc.html` |
| Client apps | `AliStore Клиент App 3.0.dc.html` |
| HR | `AliStore HR 3.0.dc.html` |
| Finance | `AliStore Финансы 3.0.dc.html` |
| Analytics | `AliStore Аналитика 3.0.dc.html` |
| Security | `AliStore Безопасность 3.0.dc.html` |
| Logistics | `AliStore Логистика 3.0.dc.html` |
| Marketing/CMS | `AliStore Маркетинг CMS 3.0.dc.html` |
| Store operations | `AliStore Операционка точки 3.0.dc.html` |
| Service center | `AliStore Сервис-центр 3.0.dc.html` |
| Warehouse | `AliStore Складской учёт 3.0.dc.html` |
| Product management | `AliStore Управление товарами 3.0.dc.html` |
| Legal | `AliStore Юридическое 3.0.dc.html` |

Missing or unrecoverable references use the deterministic replacements documented
in [DESIGN-3.0-REPLACEMENTS.md](./DESIGN-3.0-REPLACEMENTS.md). Those files are
explicitly marked as generated replacements and are not presented as recovered
Claude Design artifacts.

## Implementation contract

- Web and ERP surfaces use the dark glass shell: `#0B0A08`, `#181410`, `#201B17`.
- Primary actions use coral; positive and selected states use lime; warnings use gold.
- Every screen owns loading, empty, error, permission and offline states in the same
  visual language.
- Desktop uses the dense 3.0 workspace grid; mobile collapses it to a single-column
  surface without horizontal overflow.
- SwiftUI and Compose use the shared `Design3` token sources, not ad hoc colors.
- Server-authoritative status, money and stock values are separate from visual state.

## Acceptance

The registry is considered current when:

1. the handoff graph resolves with `missingCount=0`;
2. generated replacements remain deterministic and do not overwrite supplied originals;
3. Web route screenshots contain no legacy light interactive surfaces;
4. native targets compile against the shared Design3 token sources;
5. visual, UI and reconciliation gates are reported separately from the design gate.

Re-run the replacement generator after adding a new missing reference:

```bash
node scripts/generate-design3-replacements.mjs
npm run build -w @alistore/web
```
