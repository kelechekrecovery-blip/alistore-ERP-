'use client';

import Link from 'next/link';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { som } from '@/lib/format';
import type { CustomerLoyalty, MyOrder } from '@/lib/api';

const MENU: { href: string; icon: string; label: string; meta?: string }[] = [
  { href: '/account/devices', icon: '📱', label: 'Устройства', meta: 'Гарантия' },
  { href: '/account/returns', icon: '↩️', label: 'Возвраты' },
  { href: '/account/bonuses', icon: '🎁', label: 'Бонусы' },
  { href: '/account/addresses', icon: '📍', label: 'Адреса' },
  { href: '/account/notifications', icon: '🔔', label: 'Уведомления' },
  { href: '/support', icon: '💬', label: 'Поддержка' },
  { href: '/trade-in', icon: '♻️', label: 'Trade-in' },
  { href: '/account/protection', icon: '🛡', label: 'Защита' },
  { href: '/account/settings', icon: '⚙️', label: 'Настройки' },
  { href: '/b2b', icon: '🏢', label: 'Для бизнеса' },
];

const STATUS_RU: Record<string, string> = {
  created: 'Оформлен',
  reserved: 'Собран',
  paid: 'Оплачен',
  completed: 'Завершён',
  cancelled: 'Отменён',
  refunded: 'Возврат',
};

export default function MobileProfile({
  phone,
  orders,
  loyalty,
  onLogout,
}: {
  phone: string;
  orders: MyOrder[] | null;
  loyalty: CustomerLoyalty | null;
  onLogout: () => void;
}) {
  return (
    <MobileFrame active="account">
      <div className="px-4 pb-6 pt-1">
        {/* header card */}
        <div className="mb-2 flex items-center gap-3.5 rounded-[16px] border border-surface-3 bg-surface-2 p-4">
          <div className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-[22px] font-extrabold text-white">
            {phone.slice(-2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-[16px] font-bold text-white">Клиент AliStore</span>
              <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-lime-ink">GOLD</span>
            </div>
            <div className="font-mono text-[12px] text-muted">{phone}</div>
          </div>
        </div>

        {/* level */}
        <div className="mb-3.5 rounded-[16px] border border-surface-3 bg-gradient-to-br from-[#2A2A2E] to-surface-2 p-4">
          <div className="mb-2 flex justify-between text-[13px]">
            <span className="text-bright">Уровень {loyalty?.level ?? '...'}</span>
            <span className="font-mono text-lime">{loyalty ? `${loyalty.balance.toLocaleString('ru-RU')} бонусов` : 'Загрузка...'}</span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-ink-dark">
            <div className="h-full rounded-full bg-gradient-to-r from-lime to-[#8FD40F]" style={{ width: loyalty ? `${Math.max(4, Math.min(100, 100 - loyalty.nextLevelSpend / 1000))}%` : '4%' }} />
          </div>
          <div className="mt-1.5 text-[11px] text-subtle">{loyalty ? `До следующего уровня осталось ${som(loyalty.nextLevelSpend)}` : 'Загружаем программу лояльности'}</div>
        </div>

        {/* menu */}
        <div className="grid grid-cols-2 gap-2.5">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
              <div className="text-[22px]">{m.icon}</div>
              <div className="mt-2 text-[13px] font-semibold text-white">{m.label}</div>
              {m.meta && <div className="mt-0.5 text-[11px] text-lime">{m.meta}</div>}
            </Link>
          ))}
        </div>

        {/* recent orders */}
        {orders && orders.length > 0 && (
          <>
            <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">Мои заказы</div>
            <div className="overflow-hidden rounded-[14px] border border-surface-3 bg-surface-2">
              {orders.slice(0, 4).map((o) => (
                <Link
                  key={o.id}
                  href={`/account/orders/${o.id}`}
                  className="flex items-center gap-2 border-b border-surface-3 px-3.5 py-3 last:border-0"
                >
                  <span className="font-mono text-[12px] text-bright">#{o.id.slice(-8)}</span>
                  <span className="text-[11px] text-subtle">{STATUS_RU[o.status] ?? o.status}</span>
                  <span className="ml-auto font-display text-[13px] font-bold text-white">{som(o.total)}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <button type="button" onClick={onLogout} className="mt-[18px] w-full text-center text-[13px] text-danger-soft">
          Выйти из аккаунта
        </button>
      </div>
    </MobileFrame>
  );
}
