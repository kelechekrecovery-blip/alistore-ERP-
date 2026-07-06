'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function AuthNav() {
  const { user, hydrated } = useAuth();

  if (!hydrated) {
    return <span aria-hidden className="h-9 w-20 rounded-chip bg-ink/5" />;
  }

  return (
    <Link
      href={user ? '/account' : '/login'}
      className="inline-flex items-center gap-2 rounded-chip border border-ink/15 px-3 py-2 text-sm font-medium text-ink/80 transition hover:border-ink/30 hover:text-ink"
    >
      {user ? 'Кабинет' : 'Войти'}
    </Link>
  );
}
