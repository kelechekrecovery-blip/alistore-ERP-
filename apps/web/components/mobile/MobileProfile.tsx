'use client';

import Link from 'next/link';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { som } from '@/lib/format';
import type { MyOrder } from '@/lib/api';

const MENU: { href: string; icon: string; label: string; meta?: string }[] = [
  { href: '/account/devices', icon: '📱', label: 'Устройства', meta: 'Гарантия' },
  { href: '/account/returns', icon: '↩️', label: 'Возвраты' },
  { href: '/account/bonuses', icon: '🎁', label: 'Бонусы', meta: '4 820' },
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
  onLogout,
}: {
  phone: string;
  orders: MyOrder[] | null;
  onLogout: () => void;
}) {
  return (
    <MobileFrame active="account">
      <div className="px-4 pb-6 pt-1">
        {/* header card */}
        <div className="mb-2 flex items-center gap-3.5 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-[22px] font-extrabold text-white">
            {phone.slice(-2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-[16px] font-bold text-white">Клиент AliStore</span>
              <span className="rounded-full bg-[#E5B23C] px-2 py-0.5 text-[10px] font-bold text-[#14110E]">GOLD</span>
            </div>
            <div className="font-mono text-[12px] text-[#A79C92]">{phone}</div>
          </div>
        </div>

        {/* level */}
        <div className="mb-3.5 rounded-[16px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-4">
          <div className="mb-2 flex justify-between text-[13px]">
            <span className="text-[#D8CFC6]">Уровень Gold</span>
            <span className="font-mono text-lime">4 820 бонусов</span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-[#16130F]">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-lime to-[#8FD40F]" />
          </div>
          <div className="mt-1.5 text-[11px] text-[#8A7F76]">До Platinum осталось 51 000 сом покупок</div>
        </div>

        {/* menu */}
        <div className="grid grid-cols-2 gap-2.5">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
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
            <div className="overflow-hidden rounded-[14px] border border-[#2E2822] bg-[#221E19]">
              {orders.slice(0, 4).map((o) => (
                <Link
                  key={o.id}
                  href={`/account/orders/${o.id}`}
                  className="flex items-center gap-2 border-b border-[#2E2822] px-3.5 py-3 last:border-0"
                >
                  <span className="font-mono text-[12px] text-[#D8CFC6]">#{o.id.slice(-8)}</span>
                  <span className="text-[11px] text-[#8A7F76]">{STATUS_RU[o.status] ?? o.status}</span>
                  <span className="ml-auto font-display text-[13px] font-bold text-white">{som(o.total)}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <button type="button" onClick={onLogout} className="mt-[18px] w-full text-center text-[13px] text-[#FF8A7A]">
          Выйти из аккаунта
        </button>
      </div>
    </MobileFrame>
  );
}
