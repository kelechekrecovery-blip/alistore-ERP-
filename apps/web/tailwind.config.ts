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
