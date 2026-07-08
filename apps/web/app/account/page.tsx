'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchMyOrders, type MyOrder } from '@/lib/api';
import { som } from '@/lib/format';
import { MobileTabBar } from '@/components/MobileTabBar';

const STATUS: Record<string, { label: string; cls: string }> = {
  created: { label: 'Оформлен', cls: 'bg-lime/15 text-lime' },
  reserved: { label: 'Собран', cls: 'bg-info/15 text-info' },
  paid: { label: 'Оплачен', cls: 'bg-lime/15 text-lime' },
  completed: { label: 'Завершён', cls: 'bg-lime/15 text-lime' },
  cancelled: { label: 'Отменён', cls: 'bg-danger/10 text-[#FF8A7A]' },
  refunded: { label: 'Возврат', cls: 'bg-danger/10 text-[#FF8A7A]' },
  exchanged: { label: 'Обмен', cls: 'bg-warn/15 text-warn' },
};
const st = (s: string) => STATUS[s] ?? { label: s, cls: 'bg-[#2E2822] text-[#8A7F76]' };
const MENU = [
  { href: '/account/devices', icon: '📱', label: 'Мои устройства', badge: '' },
  { href: '/account/returns', icon: '↩', label: 'Возвраты', badge: '' },
  { href: '/account/bonuses', icon: '🎁', label: 'Бонусы', badge: '4 820' },
  { href: '/account/addresses', icon: '📍', label: 'Адреса', badge: '' },
  { href: '/account/notifications', icon: '🔔', label: 'Уведомления', badge: '' },
  { href: '/support', icon: '💬', label: 'Поддержка', badge: '' },
  { href: '/trade-in', icon: '♻', label: 'Trade-in', badge: 'оценка' },
  { href: '/account/settings', icon: '⚙', label: 'Настройки', badge: '' },
];

export default function AccountPage() {
  const { user, hydrated, authed, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account'); }, [hydrated, user, router]);
  useEffect(() => { if (user) authed(fetchMyOrders).then(setOrders).catch(() => setOrders([])); }, [user, authed]);

  if (!hydrated || !user) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-[#16130F] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5">
          {/* profile card */}
          <div className="mb-2 flex items-center gap-3.5 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
            <span className="grid h-13 w-13 place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-xl font-extrabold" style={{ height: 52, width: 52 }}>{user.phone.slice(-2)}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold">Клиент</span>
                <span className="rounded-chip bg-warn px-2 py-0.5 text-[10px] font-bold text-lime-ink">GOLD</span>
              </div>
              <div className="font-mono text-xs text-[#A79C92]">{user.phone}</div>
            </div>
          </div>

          {/* level */}
          <div className="mb-3.5 rounded-[16px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-4">
            <div className="mb-2 flex justify-between text-[13px]"><span className="text-[#D8CFC6]">Уровень Gold</span><span className="font-mono text-lime">4 820 бонусов</span></div>
            <div className="h-[7px] overflow-hidden rounded-chip bg-[#16130F]"><div className="h-full w-[72%] bg-gradient-to-r from-[#C6FF3D] to-[#8FD40F]" /></div>
            <div className="mt-1.5 text-[11px] text-[#8A7F76]">До Platinum осталось 51 000 сом покупок</div>
          </div>

          {/* menu */}
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {MENU.map((m) => (
              <Link key={m.href} href={m.href} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
                <div className="text-2xl">{m.icon}</div>
                <div className="mt-2 text-[13px] font-semibold">{m.label}</div>
                {m.badge && <div className="mt-1 text-[11px] text-lime">{m.badge}</div>}
              </Link>
            ))}
          </div>

          <h2 className="mb-2.5 font-display text-base font-bold">Мои заказы</h2>
          {orders === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
          {orders && orders.length === 0 && <p className="py-6 text-center text-sm text-[#8A7F76]">Заказов пока нет</p>}
          {(orders ?? []).map((o) => {
            const s = st(o.status);
            return (
              <Link key={o.id} href={`/account/orders/${o.id}`} className="mb-2.5 flex items-center gap-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
                <span className="font-mono text-sm font-bold">#{o.id.slice(-6)}</span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                <span className="text-[13px] text-[#A79C92]">{o.fulfillmentType ?? o.channel}</span>
                <span className="ml-auto font-display font-extrabold text-lime">{som(o.total)}</span>
              </Link>
            );
          })}

          <button type="button" onClick={async () => { await logout(); router.push('/'); }} className="mt-4 w-full text-center text-[13px] text-[#FF8A7A]">Выйти из аккаунта</button>
        </div>
        <MobileTabBar active="account" />
      </div>
    </div>
  );
}
