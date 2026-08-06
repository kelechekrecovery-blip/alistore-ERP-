# Theme and design tokens

## Part 1 — compact token summary

### Stack and sources

- Tailwind CSS 3 with custom values in `apps/web/tailwind.config.ts`.
- Global variables, fonts, component utilities, responsive overrides, motion, and light/dark ecosystem-specific styling live in `apps/web/app/globals.css`.
- There is no `.dark` selector or theme-provider toggle. Light storefront surfaces and dark POS/ERP/mobile surfaces are selected explicitly by semantic classes/tokens.

### Color palette

| Token | Value |
|---|---|
| coral / deep / tint | `#FF5B2E` / `#E8410F` / `#FFEFE7` |
| coral-soft / coral-light / coral-tint | `#FF6B55` / `#FF8A5F` / `#FFB5AA` |
| ink / ink-dark / night | `#201B17` / `#16130F` / `#0E0C0A` |
| sand / paper / mist / haze / linen | `#F7F2EC` / `#F5F5F7` / `#E5E5E7` / `#D2D2D7` / `#E7DDD3` |
| graphite / slate / steel / coal | `#1D1D1F` / `#8A8A8A` / `#4A4A4A` / `#0F0F0F` |
| lime / lime-dark / lime-ink | `#C6FF3D` / `#A8E23A` / `#14110E` |
| success / success-soft | `#2E7D46` / `#7FD3A0` |
| warn / danger / danger-soft / info | `#E5B23C` / `#C6362C` / `#FF8A7A` / `#7FB0EC` |
| surface / surface-2 / surface-3 / line | `#1A1611` / `#221E19` / `#2E2822` / `#3A332C` |
| bright / muted / subtle / faint | `#D8CFC6` / `#A79C92` / `#8A7F76` / `#6E645C` |
| ERP background / coral highlight / green | `#0B0A08` / `#FF7A4D` / `#4ED17A` |
| ERP glass / strong / border | `rgba(255,255,255,.055)` / `rgba(255,255,255,.085)` / `rgba(255,255,255,.11)` |

The `:root` CSS variables mirror the canonical Tailwind palette. There are no separate `.dark` overrides.

### Typography

- Display: `Sora`, then `Golos Text`, system UI, sans-serif.
- Sans/body: `Golos Text`, system UI, sans-serif.
- Mono: `JetBrains Mono`, ui-monospace, monospace.
- Vendored `@font-face` ranges are defined in full below.
- Type scale is Tailwind's default scale: `xs 12px`, `sm 14px`, `base 16px`, `lg 18px`, `xl 20px`, `2xl 24px`, `3xl 30px`, `4xl 36px`, `5xl 48px`, `6xl 60px`, `7xl 72px`, `8xl 96px`, `9xl 128px`.
- Headings use the display stack; body uses sans; font smoothing and `ss01` are globally enabled.

### Spacing, radius, shadows, width

- Spacing uses Tailwind's default 4px base scale (for example `1=4px`, `2=8px`, `3=12px`, `4=16px`, `5=20px`, `6=24px`, `8=32px`, `10=40px`, `12=48px`, `16=64px`, `24=96px`).
- Radius: `card=18px`, `btn=11px`, `chip=999px`; other numeric radii use Tailwind defaults or explicit arbitrary values.
- Shadow `soft`: `0 1px 2px rgba(32,27,23,.04), 0 8px 24px rgba(32,27,23,.06)`.
- Shadow `lift`: `0 6px 16px rgba(32,27,23,.10), 0 18px 40px rgba(232,65,15,.10)`.
- Content max width: `1280px`; several shells also use explicit `1200px`, `1400px`, or `440px` bounds.

### Breakpoints and motion

- Default Tailwind breakpoints: `sm 640px`, `md 768px`, `lg 1024px`, `xl 1280px`, `2xl 1536px`.
- Global CSS adds explicit mobile/desktop media rules at `767px/768px`.
- `prefers-reduced-motion: reduce` disables nonessential animation and smooth scrolling.

## Part 2 — raw source dumps

### `apps/web/tailwind.config.ts`

```ts
import type { Config } from 'tailwindcss';

// Design tokens — canonical source: design_handoff_alistore/docs/Native Design System.md §1.
//
// Canon ↔ code name map (values identical; code keeps its shipped names to avoid churn):
//   coralDeep → deep · bgLight → sand · onLime → lime-ink · bgDark → ink-dark
// Dark-surface neutrals (canon §5 "инверсия нейтралей") are tokenized here so no UI
// hardcodes them: night/surface*/line + on-dark text bright/muted/subtle/faint.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        coral: '#FF5B2E', // основной бренд, CTA
        deep: '#E8410F', // = canon coralDeep — цена, pressed/hover
        ink: '#201B17', // основной текст, тёмные шапки
        'ink-dark': '#16130F', // = canon bgDark — фон тёмных экранов
        night: '#0E0C0A', // = canon bgDark (darkest) — фон страницы
        tint: '#FFEFE7', // мягкий фон акции/бейджа
        sand: '#F7F2EC', // = canon bgLight — нейтральный фон витрины
        // Action accent on dark (POS/ERP)
        lime: '#C6FF3D', // основное действие на тёмном
        'lime-dark': '#A8E23A', // pressed lime (аналог deep для coral)
        'lime-ink': '#14110E', // = canon onLime — текст на lime
        // Functional / status
        success: '#2E7D46',
        'success-soft': '#7FD3A0', // on-dark success (✓ на тёмном)
        warn: '#E5B23C',
        danger: '#C6362C',
        'danger-soft': '#FF8A7A', // on-dark danger
        info: '#7FB0EC',
        // Dark-surface neutral scale (backgrounds)
        surface: '#1A1611', // приподнятая поверхность на night
        'surface-2': '#221E19', // панель/карточка на тёмном
        'surface-3': '#2E2822', // бордер-заливка/hover на тёмном
        line: '#3A332C', // хайрлайн/бордер на тёмном
        // On-dark text scale
        bright: '#D8CFC6', // яркий текст на тёмном
        muted: '#A79C92', // приглушённый
        subtle: '#8A7F76', // вторичный
        faint: '#6E645C', // третичный/подписи
        // Light-mode neutral scale (desktop light shells — canon §5 «витрина светлая»)
        paper: '#F5F5F7', // светлейшая панель
        mist: '#E5E5E7', // светлый бордер/дивайдер
        haze: '#D2D2D7', // светлый хайрлайн (холодный)
        linen: '#E7DDD3', // тёплый светлый хайрлайн/бордер
        graphite: '#1D1D1F', // near-black текст (светлые шапки)
        slate: '#8A8A8A', // серый текст на светлом
        steel: '#4A4A4A', // тёмно-серый текст
        coal: '#0F0F0F', // near-black фон
        // Coral family (тинты/оттенки)
        'coral-soft': '#FF6B55', // светлее coral (градиенты/hover)
        'coral-light': '#FF8A5F', // coral-текст на тёмном
        'coral-tint': '#FFB5AA', // мягкий coral (бейдж/фон)
      },
      fontFamily: {
        // next/font CSS vars (see app/fonts.ts). Display falls back to Golos
        // (--font-sans) for Cyrillic, since Sora has no Cyrillic glyphs.
        display: [
          'var(--font-display)',
          'var(--font-sans)',
          'system-ui',
          'sans-serif',
        ],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        btn: '11px',
        chip: '999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(32,27,23,0.04), 0 8px 24px rgba(32,27,23,0.06)',
        lift: '0 6px 16px rgba(32,27,23,0.10), 0 18px 40px rgba(232,65,15,0.10)',
      },
      maxWidth: {
        content: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

### `apps/web/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Vendored copies keep production builds deterministic when the build runner has no network. */
@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("/fonts/75f2fdf2e0b68dfe-s.0fq57cj8krwmf.woff2") format("woff2");
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}

@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("/fonts/cfdfbee4d6cf0a93-s.p.1jwcpm6w583_v.woff2") format("woff2");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}

@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("/fonts/634e9805ffc8f226-s.2ocajiqvilzpk.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@font-face {
  font-family: "Golos Text";
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
  src: url("/fonts/b4a06a523f527a0e-s.p.3psl0_mnhzy2y.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "Sora";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/b886574ba42c3409-s.1_wjncogyh-s7.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@font-face {
  font-family: "Sora";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/c41ca59f1c34ba31-s.p.2y2uoi4t910qy.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/13bf9871fe164e7f-s.2f7nqdagzwx2-.woff2") format("woff2");
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/cc545e633e20c56d-s.p.176arc174-8zp.woff2") format("woff2");
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/71b036adf157cdcf-s.0bp8oijd_gu96.woff2") format("woff2");
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/89b21bb081cb7469-s.1fby2rem9ngyr.woff2") format("woff2");
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/3fe682a82f50d426-s.0vfdmo25voy_0.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("/fonts/70bc3e132a0a741e-s.p.3t6q91iet4nsy.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
  --font-display: "Sora", Arial, sans-serif;
  --font-sans: "Golos Text", Arial, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

:root {
  /* Canonical palette — design_handoff_alistore/docs/Native Design System.md §1.
     Mirrors tailwind.config.ts so non-Tailwind CSS + desktop overrides stay 1:1. */
  --coral: #ff5b2e;
  --deep: #e8410f;
  --ink: #201b17;
  --ink-dark: #16130f;
  --night: #0e0c0a;
  --tint: #ffefe7;
  --sand: #f7f2ec;
  --lime: #c6ff3d;
  --lime-dark: #a8e23a;
  --lime-ink: #14110e;
  --success: #2e7d46;
  --success-soft: #7fd3a0;
  --warn: #e5b23c;
  --danger: #c6362c;
  --danger-soft: #ff8a7a;
  --info: #7fb0ec;
  --surface: #1a1611;
  --surface-2: #221e19;
  --surface-3: #2e2822;
  --line: #3a332c;
  --bright: #d8cfc6;
  --muted: #a79c92;
  --subtle: #8a7f76;
  --faint: #6e645c;
  --paper: #f5f5f7;
  --mist: #e5e5e7;
  --haze: #d2d2d7;
  --linen: #e7ddd3;
  --graphite: #1d1d1f;
  --slate: #8a8a8a;
  --steel: #4a4a4a;
  --coal: #0f0f0f;
  --coral-soft: #ff6b55;
  --coral-light: #ff8a5f;
  --coral-tint: #ffb5aa;
  /* Design 3.0 surfaces from the latest desktop handoff. */
  --erp-bg: #0b0a08;
  --erp-glass: rgba(255, 255, 255, 0.055);
  --erp-glass-strong: rgba(255, 255, 255, 0.085);
  --erp-glass-border: rgba(255, 255, 255, 0.11);
  --erp-coral-hi: #ff7a4d;
  --erp-green: #4ed17a;
}

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
  }
  body {
    background-color: var(--sand);
    color: var(--ink);
    font-family: var(--font-sans), system-ui, sans-serif;
    font-feature-settings: 'ss01';
    -webkit-font-smoothing: antialiased;
  }
  h1,
  h2,
  h3,
  h4 {
    font-family: var(--font-display), var(--font-sans), system-ui, sans-serif;
    letter-spacing: 0;
  }
  ::selection {
    background: var(--lime);
    color: var(--lime-ink);
  }
}

@layer components {
  /**
   * Минимальная зона нажатия 44×44 — веб-двойник `minTapTarget(_:)` из
   * `apps/ios/Shared/TapTarget.swift`, который натив уже применяет к тем же
   * иконкам сравнения и уведомлений (`AliStoreClientApp.swift:182-184`).
   *
   * На вебе такой утилиты не было, и у иконочных ссылок зона нажатия равнялась
   * самому глифу: замер на мобильной витрине дал 18×18 у «Сравнения» и
   * «Уведомлений». Промах по такой цели — обычное дело на телефоне, а
   * телефон здесь основной канал.
   *
   * Растёт только зона, не вид: иконка остаётся своего размера, а
   * `inline-flex` + центрирование удерживают её на месте.
   */
  .tap-target {
    @apply inline-flex items-center justify-center;
    min-width: 44px;
    min-height: 44px;
  }

  .input {
    @apply w-full rounded-btn border border-ink/15 bg-white px-4 py-2.5 text-base text-ink outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-4 focus:ring-coral/15;
  }

  .erp3-stage {
    background:
      radial-gradient(circle at 22% 0%, rgba(255, 91, 46, 0.24), transparent 38%),
      radial-gradient(circle at 88% 16%, rgba(123, 36, 117, 0.2), transparent 34%),
      linear-gradient(135deg, #17120e 0%, var(--erp-bg) 48%, #11100e 100%);
  }

  .erp3-shell {
    background:
      radial-gradient(circle at 24% 0%, rgba(255, 91, 46, 0.18), transparent 35%),
      radial-gradient(circle at 88% 20%, rgba(123, 36, 117, 0.14), transparent 32%),
      linear-gradient(135deg, #1b1510 0%, #13100d 42%, var(--erp-bg) 100%);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 26px;
    box-shadow: 0 50px 120px rgba(0, 0, 0, 0.62);
  }

  .erp3-glass {
    background: linear-gradient(160deg, var(--erp-glass-strong), rgba(255, 255, 255, 0.018));
    border: 1px solid var(--erp-glass-border);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.14);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    backdrop-filter: blur(22px) saturate(180%);
  }

  .erp3-glass-strong {
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.025));
    border: 1px solid rgba(255, 255, 255, 0.13);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
  }

  .erp3-coral-action {
    background: linear-gradient(135deg, var(--erp-coral-hi), var(--deep));
    color: #14110e !important;
    box-shadow: 0 6px 18px rgba(255, 91, 46, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.34);
  }

  /* Dark storefront copy must remain readable at the small sizes used by the
     handoff. These opacity utilities were originally tuned for atmosphere,
     but several fell below WCAG AA against the dark shell. */
  .text-white\/35 { color: rgba(255, 255, 255, 0.60) !important; }
  .text-white\/40 { color: rgba(255, 255, 255, 0.60) !important; }
  .text-white\/45 { color: rgba(255, 255, 255, 0.65) !important; }
  .text-white\/50 { color: rgba(255, 255, 255, 0.70) !important; }
  .text-white\/55 { color: rgba(255, 255, 255, 0.75) !important; }

  /* Coral is the brand surface; dark ink is the accessible foreground on it. */
  .bg-coral.text-white,
  .checkout-primary,
  .login-shell .bg-coral {
    color: #14110e !important;
  }

  /* Legacy operations pages keep their business markup but inherit the 3.0 glass shell. */
  .erp3-stage .bg-white,
  .erp3-stage .bg-white\/50,
  .erp3-stage .bg-sand\/50,
  .erp3-stage .bg-sand\/60,
  .erp3-stage .bg-sand\/70 {
    background-color: rgba(255, 255, 255, 0.055) !important;
    background-image: none !important;
  }

  .erp3-stage .text-ink,
  .erp3-stage .text-ink\/70,
  .erp3-stage .text-ink\/65,
  .erp3-stage .text-ink\/60,
  .erp3-stage .text-ink\/55,
  .erp3-stage .text-ink\/50,
  .erp3-stage .text-ink\/45,
  .erp3-stage .text-ink\/40 {
    color: var(--bright) !important;
  }

  .erp3-stage [class*="border-ink/"] {
    border-color: var(--erp-glass-border) !important;
  }

  .erp3-stage .shadow-soft {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36) !important;
  }
}

@layer utilities {
  /* subtle warm paper grain for atmosphere */
  .bg-grain {
    background-image: radial-gradient(
      rgba(32, 27, 23, 0.035) 1px,
      transparent 1px
    );
    background-size: 4px 4px;
  }
  .tabular {
    font-variant-numeric: tabular-nums;
  }
}

@keyframes store-enter {
  0%, 100% { opacity: 1; transform: translate3d(0, 0, 0); }
  45% { opacity: 1; transform: translate3d(0, -4px, 0); }
}

@keyframes store-product-enter {
  0%, 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  55% { opacity: 1; transform: translate3d(0, -8px, 0) scale(1.015) rotate(0.4deg); }
}

@keyframes store-product-float {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(-0.5deg); }
  50% { transform: translate3d(0, -12px, 0) rotate(0.7deg); }
}

@keyframes store-scroll-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.store-motion-enter {
  animation: store-enter 680ms cubic-bezier(0.16, 1, 0.3, 1) var(--store-delay, 0s) both;
}

.store-motion-stagger > * {
  animation: store-enter 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.store-motion-stagger > :nth-child(1) { animation-delay: 60ms; }
.store-motion-stagger > :nth-child(2) { animation-delay: 130ms; }
.store-motion-stagger > :nth-child(3) { animation-delay: 200ms; }
.store-motion-stagger > :nth-child(4) { animation-delay: 270ms; }
.store-motion-stagger > :nth-child(5) { animation-delay: 340ms; }

.store-product-float {
  animation:
    store-product-enter 820ms cubic-bezier(0.16, 1, 0.3, 1) 140ms both,
    store-product-float 5.4s ease-in-out 1.1s 2;
}

.store-card-enter {
  animation: store-enter 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.store-scroll-progress {
  transform: scaleX(0);
}

@supports (animation-timeline: scroll()) {
  .store-scroll-progress {
    animation: store-scroll-progress linear both;
    animation-timeline: scroll(root block);
  }
}

@media (prefers-reduced-motion: reduce) {
  .store-motion-enter,
  .store-motion-stagger > *,
  .store-product-float,
  .store-card-enter,
  .store-scroll-progress {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}

@media (min-width: 768px) {
  .account-detail-shell {
    position: static;
    z-index: auto;
    display: block;
    min-height: 100vh;
    background: #0b0a08;
    color: #e5dcd3;
  }

  .account-detail-header,
  .account-detail-footer {
    display: block;
  }

  .account-detail-panel {
    width: min(1180px, 92vw);
    max-width: none;
    min-height: 620px;
    height: auto;
    margin-inline: auto;
    padding-block: 32px 64px;
    background: transparent;
    color: #e5dcd3;
  }

  .account-detail-panel > .overflow-y-auto {
    overflow: visible;
    padding-inline: 0;
  }

  .account-detail-panel .bg-\[\#221E19\],
  .account-detail-panel .bg-\[\#16130F\] {
    background: rgba(255,255,255,.04) !important;
  }

  .account-detail-panel .border-\[\#2E2822\] {
    border-color: rgba(255,255,255,.1) !important;
  }

  .account-detail-panel .text-white,
  .account-detail-panel .text-\[\#D8CFC6\] {
    color: #e5dcd3 !important;
  }

  .account-detail-panel .text-\[\#A79C92\],
  .account-detail-panel .text-\[\#8A7F76\],
  .account-detail-panel .text-\[\#6E645C\] {
    color: rgba(255,255,255,.45) !important;
  }

  .account-detail-panel .bg-lime {
    background: #ff5b2e !important;
    color: #fff !important;
  }

  .account-detail-panel .text-lime {
    color: #ff7a4d !important;
  }

  .customer-service-shell {
    background: #0b0a08;
    color: #e5dcd3;
  }

  .customer-service-main {
    width: min(1180px, 92vw);
    padding-block: 48px 72px;
  }

  .customer-service-back {
    border-color: rgba(255,255,255,.1);
    background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.7);
  }

  .customer-service-title {
    color: #fff;
    font-size: 32px;
  }

  .customer-service-subtitle {
    color: rgba(255,255,255,.45);
  }

  .customer-service-content {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }

  .customer-service-content .bg-\[\#221E19\],
  .customer-service-content .bg-\[\#16130F\] {
    background: rgba(255,255,255,.04) !important;
  }

  .customer-service-content .border-\[\#2E2822\] {
    border-color: rgba(255,255,255,.1) !important;
  }

  .customer-service-content .text-\[\#D8CFC6\],
  .customer-service-content .text-\[\#A79C92\] {
    color: #e5dcd3 !important;
  }

  .customer-service-content .text-\[\#8A7F76\],
  .customer-service-content .text-\[\#6E645C\] {
    color: rgba(255,255,255,.45) !important;
  }

  .customer-service-content .bg-lime {
    background: #ff5b2e !important;
    color: #fff !important;
  }

  .login-shell {
    background: #0b0a08 !important;
    color: #fff !important;
  }

  .login-panel {
    border-color: rgba(255,255,255,.11) !important;
    background: rgba(255,255,255,.035) !important;
    box-shadow: 0 30px 90px -60px rgba(255,91,46,.7) !important;
  }

  .login-tabs {
    background: rgba(255,255,255,.06) !important;
  }

  .login-field {
    border-color: rgba(255,255,255,.1) !important;
    background: rgba(255,255,255,.05) !important;
    color: #fff !important;
  }

  /* Login is dark+lime on mobile (canon §5 dark accent); flip lime -> brand coral on the light desktop shell. */
  .login-shell .bg-lime,
  .login-panel .bg-lime {
    background: #ff5b2e !important;
    color: #14110e !important;
  }
  .login-shell .text-lime,
  .login-panel .text-lime {
    color: #ff5b2e !important;
  }
  .login-field:focus {
    border-color: #ff5b2e !important;
  }

  .checkout-shell {
    background: #0b0a08 !important;
    color: #fff !important;
  }

  .checkout-panel {
    border-color: rgba(255,255,255,.1) !important;
    background: rgba(255,255,255,.04) !important;
    box-shadow: 0 16px 40px rgba(0,0,0,.3) !important;
  }

  .checkout-surface,
  .checkout-nested {
    border-color: rgba(255,255,255,.1) !important;
    background: rgba(255,255,255,.04) !important;
    color: #e5dcd3 !important;
  }

  .checkout-field {
    border-color: rgba(255,255,255,.1) !important;
    background: rgba(255,255,255,.05) !important;
    color: #fff !important;
  }

  .checkout-primary {
    background: #ff5b2e !important;
    color: #ffffff !important;
  }

  .checkout-panel .text-white,
  .checkout-panel .text-\[\#D8CFC6\] {
    color: #fff !important;
  }

  .checkout-panel .text-lime {
    color: #ff5b2e !important;
  }

  .checkout-panel .border-lime {
    border-color: #ff5b2e !important;
  }

  .checkout-panel .bg-lime {
    background: #ff5b2e !important;
  }

  /* Token-class equivalents of the hex overrides above. After Phase-2 tokenization
     the dark mobile classes (.bg-[#221E19] etc.) became token classes, so the desktop
     light-shell overrides must also target the tokens or the desktop panels render dark. */
  .account-detail-panel .bg-surface-2,
  .account-detail-panel .bg-ink-dark,
  .customer-service-content .bg-surface-2,
  .customer-service-content .bg-ink-dark {
    background: rgba(255,255,255,.04) !important;
  }
  .account-detail-panel .border-surface-3,
  .customer-service-content .border-surface-3 {
    border-color: rgba(255,255,255,.1) !important;
  }
  .account-detail-panel .text-bright {
    color: #fff !important;
  }
  .account-detail-panel .text-muted,
  .account-detail-panel .text-subtle,
  .account-detail-panel .text-faint {
    color: rgba(255,255,255,.45) !important;
  }
  .customer-service-content .text-bright,
  .customer-service-content .text-muted {
    color: rgba(255,255,255,.7) !important;
  }
  .customer-service-content .text-subtle,
  .customer-service-content .text-faint {
    color: rgba(255,255,255,.45) !important;
  }
  .checkout-panel .text-bright {
    color: #201b17 !important;
  }
  .checkout-panel .bg-surface-2,
  .checkout-panel .bg-ink-dark,
  .checkout-panel .bg-surface {
    background: #fff !important;
  }
  .checkout-panel .border-surface-3,
  .checkout-panel .border-line {
    border-color: #e7ddd3 !important;
  }
  .checkout-panel .text-muted,
  .checkout-panel .text-subtle,
  .checkout-panel .text-faint {
    color: #6e645c !important;
  }
  /* Warning/error text (coral-tint on the dark mobile field) must be legible on the white
     desktop panel — flip to danger red. */
  .checkout-panel .text-coral-tint {
    color: #c6362c !important;
  }
}

@media (max-width: 767px) {
  .account-detail-shell {
    background-color: #0e0c0a !important;
  }
}

@media (max-width: 767px) {
  .account-detail-header,
  .account-detail-footer {
    display: none;
  }
}
```

### `apps/web/app/fonts.ts`

```ts
// Keep the type contract used by Tailwind without making production builds depend
// on a network request to Google Fonts. The CSS variables are defined in
// globals.css and use system stacks until approved font files are vendored.
export const fontDisplay = { variable: 'font-display' };
export const fontSans = { variable: 'font-sans' };
export const fontMono = { variable: 'font-mono' };
```
