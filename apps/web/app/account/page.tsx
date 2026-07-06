'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchMyOrders, type MyOrder } from '@/lib/api';
import { som } from '@/lib/format';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Черновик', cls: 'bg-ink/10 text-ink/60' },
  created: { label: 'Оформлен', cls: 'bg-tint text-deep' },
  reserved: { label: 'Зарезервирован', cls: 'bg-info/15 text-info' },
  awaiting_payment: { label: 'Ждёт оплаты', cls: 'bg-warn/20 text-warn' },
  paid: { label: 'Оплачен', cls: 'bg-success/15 text-success' },
  out_for_delivery: { label: 'В доставке', cls: 'bg-info/15 text-info' },
  delivered: { label: 'Доставлен', cls: 'bg-success/15 text-success' },
  completed: { label: 'Завершён', cls: 'bg-success/15 text-success' },
  cancelled: { label: 'Отменён', cls: 'bg-danger/10 text-danger' },
};

function statusOf(s: string) {
  return STATUS[s] ?? { label: s, cls: 'bg-ink/10 text-ink/60' };
}

export default function AccountPage() {
  const { user, hydrated, authed, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (hydrated && !user) router.replace('/login?next=/account');
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!user) return;
    authed(fetchMyOrders)
      .then(setOrders)
      .catch(() => setLoadError(true));
  }, [user, authed]);

  if (!hydrated || !user) {
    return (
      <div className="py-24 text-center font-mono text-sm text-ink/40">Загрузка…</div>
    );
  }

  return (
    <div className="py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-ink">Личный кабинет</h1>
          <p className="mt-1 font-mono text-sm text-ink/50">{user.phone}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
          className="rounded-btn border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-danger/40 hover:text-danger"
        >
          Выйти
        </button>
      </div>

      <h2 className="mb-4 font-display text-xl font-bold text-ink">Мои заказы</h2>

      {orders === null && !loadError && (
        <p className="font-mono text-sm text-ink/40">Загружаем заказы…</p>
      )}

      {loadError && (
        <p className="rounded-card border border-dashed border-danger/30 bg-white/50 px-6 py-8 text-center text-sm text-danger">
          Не удалось загрузить заказы. Обновите страницу.
        </p>
      )}

      {orders && orders.length === 0 && (
        <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-14 text-center">
          <p className="font-display text-lg font-bold text-ink">Заказов пока нет</p>
          <Link href="/" className="mt-4 inline-flex text-sm text-coral hover:text-deep">
            В каталог →
          </Link>
        </div>
      )}

      {orders && orders.length > 0 && (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => {
            const st = statusOf(o.status);
            const count = o.items.reduce((s, i) => s + i.qty, 0);
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-4 rounded-card border border-ink/10 bg-white p-4 shadow-soft"
              >
                <span className="font-mono text-sm font-semibold text-ink">
                  #{o.id.slice(-8)}
                </span>
                <span className={`rounded-chip px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                  {st.label}
                </span>
                <span className="text-sm text-ink/55">
                  {count} {count === 1 ? 'товар' : 'товара/ов'} · {o.channel}
                </span>
                <span className="ml-auto font-mono font-bold tabular text-ink">
                  {som(o.total)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
