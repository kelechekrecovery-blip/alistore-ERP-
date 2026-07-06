import type { Config } from 'tailwindcss';

// Design tokens — source: design_handoff_alistore (README «Design Tokens»).
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        coral: '#FF5B2E',
        deep: '#E8410F',
        ink: '#201B17',
        'ink-dark': '#16130F',
        tint: '#FFEFE7',
        sand: '#F7F2EC',
        lime: '#C6FF3D',
        'lime-ink': '#14110E',
        success: '#2E7D46',
        warn: '#E5B23C',
        danger: '#C6362C',
        info: '#7FB0EC',
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['"Golos Text"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
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
