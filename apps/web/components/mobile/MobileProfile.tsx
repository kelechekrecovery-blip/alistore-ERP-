'use client';

import Link from 'next/link';
import {
  Bell,
  Building2,
  Gift,
  MapPin,
  MessageCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Smartphone,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { som } from '@/lib/format';
import type { CustomerLoyalty, MyOrder } from '@/lib/api';

const MENU: { href: string; Icon: LucideIcon; label: string; meta?: string }[] = [
  { href: '/account/devices', Icon: Smartphone, label: 'Устройства', meta: 'Гарантия' },
  { href: '/account/returns', Icon: Undo2, label: 'Возвраты' },
  { href: '/account/bonuses', Icon: Gift, label: 'Бонусы' },
  { href: '/account/addresses', Icon: MapPin, label: 'Адреса' },
  { href: '/account/notifications', Icon: Bell, label: 'Уведомления' },
  { href: '/support', Icon: MessageCircle, label: 'Поддержка' },
  { href: '/trade-in', Icon: RotateCcw, label: 'Trade-in' },
  { href: '/account/protection', Icon: ShieldCheck, label: 'Защита' },
  { href: '/account/settings', Icon: Settings, label: 'Настройки' },
  { href: '/b2b', Icon: Building2, label: 'Для бизнеса' },
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
  ordersError = '',
  loyalty,
  loyaltyError = false,
  onLogout,
}: {
  phone: string;
  orders: MyOrder[] | null;
  /** Текст отказа загрузки заказов; пустая строка — отказа не было. */
  ordersError?: string;
  loyalty: CustomerLoyalty | null;
  loyaltyError?: boolean;
  onLogout: () => void;
}) {
  const levelLabel = loyalty?.level ?? '...';

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
              <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-lime-ink">{levelLabel}</span>
            </div>
            <div className="font-mono text-[12px] text-muted">{phone}</div>
          </div>
        </div>

        {/* level */}
        <div className="mb-3.5 rounded-[16px] border border-surface-3 bg-gradient-to-br from-surface-3 to-surface-2 p-4">
          <div className="mb-2 flex justify-between text-[13px]">
            <span className="text-bright">Уровень {levelLabel}</span>
            <span className="font-mono text-lime">{loyalty ? `${loyalty.balance.toLocaleString('ru-RU')} бонусов` : loyaltyError ? 'Ошибка загрузки' : 'Загрузка...'}</span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-ink-dark">
            <div className="h-full rounded-full bg-gradient-to-r from-lime to-[#8FD40F]" style={{ width: loyalty ? `${Math.max(4, Math.min(100, 100 - loyalty.nextLevelSpend / 1000))}%` : '4%' }} />
          </div>
          <div className="mt-1.5 text-[11px] text-subtle">{loyalty ? `До следующего уровня осталось ${som(loyalty.nextLevelSpend)}` : loyaltyError ? 'Не удалось загрузить программу лояльности' : 'Загружаем программу лояльности'}</div>
        </div>

        {/* menu */}
        <div className="grid grid-cols-2 gap-2.5">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
              <m.Icon size={22} strokeWidth={1.8} aria-hidden className="text-lime" />
              <div className="mt-2 text-[13px] font-semibold text-white">{m.label}</div>
              {m.meta && <div className="mt-0.5 text-[11px] text-lime">{m.meta}</div>}
            </Link>
          ))}
        </div>

        {/* recent orders */}
        {/* Раньше секция просто исчезала: и на загрузке, и на отказе, и на
            пустом списке — покупатель после оформления не находил свой заказ
            и не понимал, оформился ли он вообще. */}
        {ordersError ? (
          <>
            <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">Мои заказы</div>
            <div role="alert" className="rounded-[14px] border border-coral/30 bg-coral/[.07] px-4 py-4 text-center">
              <p className="text-[13px] text-white">Не удалось загрузить заказы</p>
              <p className="mt-1 text-[11px] text-muted">{ordersError}</p>
            </div>
          </>
        ) : orders === null ? (
          <>
            <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">Мои заказы</div>
            <div className="rounded-[14px] border border-surface-3 bg-surface-2 px-4 py-4 text-center text-[12px] text-muted">Загрузка…</div>
          </>
        ) : orders.length === 0 ? (
          <>
            <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">Мои заказы</div>
            <div className="rounded-[14px] border border-surface-3 bg-surface-2 px-4 py-4 text-center">
              <p className="text-[13px] text-white">Заказов пока нет</p>
              <Link href="/catalog" className="mt-2 inline-block text-[12px] text-lime">Перейти в каталог</Link>
            </div>
          </>
        ) : null}
        {!ordersError && orders && orders.length > 0 && (
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
