'use client';

import type { CSSProperties, ReactNode } from 'react';

export function ScrollProgress() {
  return <div aria-hidden className="store-scroll-progress absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-[#fb9a4b] via-[#f97316] to-success-soft" />;
}

export function Reveal({ children, className = '', delay = 0, distance = 24 }: { children: ReactNode; className?: string; delay?: number; distance?: number }) {
  return <div className={`store-motion-enter ${className}`} style={{ '--store-delay': `${delay}s`, '--store-distance': `${distance}px` } as CSSProperties}>{children}</div>;
}

export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`store-motion-stagger ${className}`}>{children}</div>;
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function FloatingProduct({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`store-product-float ${className}`}>{children}</div>;
}
