import { Sora, Golos_Text, JetBrains_Mono } from 'next/font/google';

// Canonical type stack — design_handoff_alistore/docs/Native Design System.md §1.
// Self-hosted via next/font: no render-blocking external stylesheet, no client-side
// Google request. Variable fonts (weight axis loaded), exposed as CSS variables that
// tailwind.config.ts fontFamily references.

// Display / headings. Sora has no Cyrillic → Cyrillic headings fall back to Golos.
export const fontDisplay = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// Body / UI — primary Russian face (Latin + Cyrillic).
export const fontSans = Golos_Text({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

// Numbers, SKU, IMEI, statuses.
export const fontMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  display: 'swap',
});
