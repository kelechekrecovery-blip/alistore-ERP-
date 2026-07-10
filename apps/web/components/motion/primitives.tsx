'use client';

import { motion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Reduced-motion-aware motion primitives for storefront micro-interactions.
 * Every initial frame is fully visible because embedded WebViews may suspend rAF.
 * The root MotionConfig disables transforms for users who prefer reduced motion.
 */

/** Expo-out — matches --ease-out-expo in the design tokens. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const DUR = 0.4;

const fadeUpVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: [0, -4, 0], transition: { duration: DUR, ease: EASE } },
};

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Give a visible element a short entrance lift without a hidden initial frame. */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 10,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: [0, -Math.min(y, 6), 0] }}
      transition={{ duration: DUR, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its <StaggerItem> children into view on mount. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

/** One staggered child — fades + rises as part of a <Stagger>. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUpVariants}>
      {children}
    </motion.div>
  );
}

/**
 * Tap/press feedback wrapper — scales down slightly on press (and lifts on hover on
 * pointer devices). Wrap cards, tiles, or buttons. Renders a plain div, so it composes
 * around a <Link> or <button> child.
 */
export function Pressable({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      className={className}
      whileTap={{ scale: 0.97 }}
      whileHover={hover ? { y: -2 } : undefined}
      transition={{ duration: 0.18, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
