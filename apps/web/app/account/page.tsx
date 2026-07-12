'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Building2, Gift, LogOut, MapPin, MessageCircle, Package, Recycle, RotateCcw, Settings, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileProfile from '@/components/mobile/MobileProfile';
import { useAuth } from '@/lib/auth';
import { fetchMyOrders, type MyOrder } from '@/lib/api';
import { som } from '@/lib/format';

const STATUS: Record<string, { label: string; cls: string }> = {
  created: { label: 'Оформлен', cls: 'border-[#60a5fa]/25 bg-[#60a5fa]/10 text-[#a9cbfb]' },
  reserved: { label: 'Собран', cls: 'border-[#60a5fa]/25 bg-[#60a5fa]/10 text-[#a9cbfb]' },
  paid: { label: 'Оплачен', cls: 'border-[#22c55e]/25 bg-[#22c55e]/10 text-[#7ee2a0]' },
  completed: { label: 'Завершён', cls: 'border-[#22c55e]/25 bg-[#22c55e]/10 text-[#7ee2a0]' },
  cancelled: { label: 'Отменён', cls: 'border-[#ef4444]/25 bg-[#ef4444]/10 text-[#ff9a9a]' },
  refunded: { label: 'Возврат', cls: 'border-[#ef4444]/25 bg-[#ef4444]/10 text-[#ff9a9a]' },
};

const MENU: Array<{ href: string; icon: LucideIcon; label: string; meta: string }> = [
  { href: '/account/devices', icon: Smartphone, label: 'Мои устройства', meta: 'Гарантии и сервис' },
  { href: '/account/returns', icon: RotateCcw, label: 'Возвраты', meta: 'Заявки и статусы' },
  { href: '/account/bonuses', icon: Gift, label: 'Бонусы', meta: '4 820 доступно' },
  { href: '/account/addresses', icon: MapPin, label: 'Адреса', meta: 'Доставка и самовывоз' },
  { href: '/account/notifications', icon: Bell, label: 'Уведомления', meta: 'Заказы и акции' },
  { href: '/support', icon: MessageCircle, label: 'Поддержка', meta: 'Чат с AliStore' },
  { href: '/trade-in', icon: Recycle, label: 'Trade-in', meta: 'Оценить устройство' },
  { href: '/b2b', icon: Building2, label: 'Для бизнеса', meta: 'Оптовые заказы' },
  { href: '/account/protection', icon: ShieldCheck, label: 'Защита устройства', meta: 'Планы покрытия' },
  { href: '/account/settings', icon: Settings, label: 'Настройки', meta: 'Профиль и безопасность' },
];

export default function AccountPage() {
  const { user, hydrated, authed, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account'); }, [hydrated, user, router]);
  useEffect(() => { if (user) authed(fetchMyOrders).then(setOrders).catch(() => setOrders([])); }, [user, authed]);

  if (!hydrated || !user) return <div className="min-h-screen bg-[#0c0c17] text-[#a2a6b6]"><SiteHeader /><div className="grid min-h-[70vh] place-items-center">Загрузка кабинета...</div></div>;

  return <>
    <div className="md:hidden"><MobileProfile phone={user.phone} orders={orders} onLogout={async () => { await logout(); router.push('/'); }} /></div>
    <div className="hidden min-h-screen bg-[#0c0c17] text-[#f6f7fb] md:block">
    <SiteHeader />
    <main className="mx-auto w-[min(1200px,92vw)] py-10 sm:py-14">
      <div className="text-xs text-[#6c7080]">Главная / Кабинет</div>
      <div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><h1 className="font-display text-4xl font-bold sm:text-5xl">Личный кабинет</h1><p className="mt-3 text-[#a2a6b6]">Заказы, устройства, гарантия и бонусы в одном месте.</p></div><button type="button" onClick={async () => { await logout(); router.push('/'); }} className="flex items-center gap-2 self-start rounded-full border border-white/[0.12] px-4 py-2.5 text-sm text-[#a2a6b6] hover:border-[#ef4444]/40 hover:text-[#ff9a9a]"><LogOut size={16} /> Выйти</button></div>

      <section className="mt-9 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="flex items-center gap-5 rounded-[22px] border border-white/[0.11] bg-[radial-gradient(circle_at_95%_0%,rgba(249,115,22,.18),transparent_50%),rgba(255,255,255,.045)] p-6 sm:p-8"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#fb9a4b] to-[#ea580c] font-display text-xl font-bold text-[#180f02]">{user.phone.slice(-2)}</span><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-bold">Клиент AliStore</h2><span className="rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-2.5 py-1 text-[11px] font-semibold text-[#fb9a4b]">GOLD</span></div><p className="mt-1 font-mono text-sm text-[#a2a6b6]">{user.phone}</p></div></div>
        <div className="rounded-[22px] border border-white/[0.11] bg-white/[0.045] p-6 sm:p-8"><div className="flex items-center justify-between"><span className="text-sm text-[#a2a6b6]">Уровень Gold</span><strong className="font-display text-xl text-[#fb9a4b]">4 820 бонусов</strong></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#f97316] to-[#fb9a4b]" /></div><p className="mt-3 text-xs text-[#6c7080]">До Platinum осталось 51 000 сом покупок</p></div>
      </section>

      <section className="pt-14"><h2 className="font-display text-2xl font-bold">Сервисы кабинета</h2><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{MENU.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-white/[0.18] hover:bg-white/[0.055]"><span className="grid h-11 w-11 place-items-center rounded-[12px] border border-[#f97316]/20 bg-[#f97316]/10 text-[#fb9a4b]"><Icon size={20} /></span><h3 className="mt-4 font-display font-semibold group-hover:text-[#fb9a4b]">{item.label}</h3><p className="mt-1 text-xs text-[#6c7080]">{item.meta}</p></Link>; })}</div></section>

      <section className="pt-14"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Мои заказы</h2><span className="text-sm text-[#6c7080]">{orders?.length ?? 0}</span></div><div className="mt-6 overflow-hidden rounded-[18px] border border-white/[0.09] bg-white/[0.025]">{orders === null ? <div className="p-8 text-center text-[#6c7080]">Загрузка заказов...</div> : orders.length === 0 ? <div className="grid min-h-[230px] place-items-center p-8 text-center"><div><Package className="mx-auto text-[#6c7080]" size={34} /><h3 className="mt-4 font-display text-lg font-semibold">Заказов пока нет</h3><Link href="/catalog" className="mt-3 inline-block text-sm text-[#fb9a4b]">Перейти в каталог</Link></div></div> : orders.map((order) => { const status = STATUS[order.status] ?? { label: order.status, cls: 'border-white/10 bg-white/5 text-[#a2a6b6]' }; return <Link key={order.id} href={`/account/orders/${order.id}`} className="grid gap-3 border-b border-white/[0.07] px-5 py-4 last:border-0 hover:bg-white/[0.035] sm:grid-cols-[150px_130px_1fr_auto] sm:items-center"><strong className="font-mono text-sm">#{order.id.slice(-8)}</strong><span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] ${status.cls}`}>{status.label}</span><span className="text-sm text-[#a2a6b6]">{order.fulfillmentType ?? order.channel}</span><strong className="font-display text-lg">{som(order.total)}</strong></Link>; })}</div></section>
    </main>
    <SiteFooter />
    </div>
  </>;
}
