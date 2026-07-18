'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Building2, Gift, LogOut, MapPin, MessageCircle, Package, Recycle, RotateCcw, Settings, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileProfile from '@/components/mobile/MobileProfile';
import { useAuth } from '@/lib/auth';
import { fetchMyLoyalty, fetchMyOrders, type CustomerLoyalty, type MyOrder } from '@/lib/api';
import { som } from '@/lib/format';

const STATUS: Record<string, { label: string; cls: string }> = {
  created: { label: 'Оформлен', cls: 'border-info/25 bg-info/10 text-info' },
  reserved: { label: 'Собран', cls: 'border-info/25 bg-info/10 text-info' },
  paid: { label: 'Оплачен', cls: 'border-success/25 bg-success/10 text-success-soft' },
  completed: { label: 'Завершён', cls: 'border-success/25 bg-success/10 text-success-soft' },
  cancelled: { label: 'Отменён', cls: 'border-danger/25 bg-danger/10 text-danger-soft' },
  refunded: { label: 'Возврат', cls: 'border-danger/25 bg-danger/10 text-danger-soft' },
};

const MENU: Array<{ href: string; icon: LucideIcon; label: string; meta: string }> = [
  { href: '/account/devices', icon: Smartphone, label: 'Мои устройства', meta: 'Гарантии и сервис' },
  { href: '/account/returns', icon: RotateCcw, label: 'Возвраты', meta: 'Заявки и статусы' },
  { href: '/account/bonuses', icon: Gift, label: 'Бонусы', meta: 'История начислений' },
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
  const [loyalty, setLoyalty] = useState<CustomerLoyalty | null>(null);

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account'); }, [hydrated, user, router]);
  useEffect(() => { if (user) authed(fetchMyOrders).then(setOrders).catch(() => setOrders([])); }, [user, authed]);
  useEffect(() => { if (user) authed(fetchMyLoyalty).then(setLoyalty).catch(() => setLoyalty(null)); }, [user, authed]);

  if (!hydrated || !user) return <div className="min-h-screen bg-paper text-steel"><SiteHeader /><div className="grid min-h-[70vh] place-items-center">Загрузка кабинета...</div></div>;

  return <>
    <div className="md:hidden"><MobileProfile phone={user.phone} orders={orders} loyalty={loyalty} onLogout={async () => { await logout(); router.push('/'); }} /></div>
    <div className="hidden min-h-screen bg-paper text-coal [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif] md:block">
    <SiteHeader />
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <div className="text-xs text-subtle">Главная / Кабинет</div>
      <div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><h1 className="font-display text-4xl font-extrabold sm:text-5xl">Личный кабинет</h1><p className="mt-3 text-faint">Заказы, устройства, гарантия и бонусы в одном месте.</p></div><button type="button" onClick={async () => { await logout(); router.push('/'); }} className="flex items-center gap-2 self-start rounded-[11px] border border-bright bg-white px-4 py-2.5 text-sm text-faint hover:border-danger/40 hover:text-danger"><LogOut size={16} /> Выйти</button></div>

      <section className="mt-9 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="flex items-center gap-5 rounded-[22px] border border-linen bg-tint p-6 shadow-soft sm:p-8"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-[16px] bg-coral font-display text-xl font-bold text-white">{user.phone.slice(-2)}</span><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-bold">Клиент AliStore</h2><span className="rounded-full border border-coral/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-deep">GOLD</span></div><p className="mt-1 font-mono text-sm text-faint">{user.phone}</p></div></div>
        <div className="rounded-[22px] border border-linen bg-white p-6 shadow-soft sm:p-8"><div className="flex items-center justify-between"><span className="text-sm text-faint">Уровень {loyalty?.level ?? '...'}</span><strong className="font-display text-xl text-deep">{loyalty ? `${loyalty.balance.toLocaleString('ru-RU')} бонусов` : 'Загрузка...'}</strong></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-linen"><div className="h-full rounded-full bg-coral" style={{ width: loyalty ? `${Math.max(4, Math.min(100, 100 - loyalty.nextLevelSpend / 1000))}%` : '4%' }} /></div><p className="mt-3 text-xs text-subtle">{loyalty ? `До следующего уровня осталось ${som(loyalty.nextLevelSpend)}` : 'Загружаем программу лояльности'}</p></div>
      </section>

      <section className="pt-14"><h2 className="font-display text-2xl font-bold">Сервисы кабинета</h2><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{MENU.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group rounded-[18px] border border-linen bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:border-coral/35"><span className="grid h-11 w-11 place-items-center rounded-[12px] border border-coral/20 bg-tint text-deep"><Icon size={20} /></span><h3 className="mt-4 font-display font-semibold group-hover:text-deep">{item.label}</h3><p className="mt-1 text-xs text-subtle">{item.meta}</p></Link>; })}</div></section>

      <section className="pt-14"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Мои заказы</h2><span className="text-sm text-subtle">{orders?.length ?? 0}</span></div><div className="mt-6 overflow-hidden rounded-[18px] border border-linen bg-white shadow-soft">{orders === null ? <div className="p-8 text-center text-subtle">Загрузка заказов...</div> : orders.length === 0 ? <div className="grid min-h-[230px] place-items-center p-8 text-center"><div><Package className="mx-auto text-subtle" size={34} /><h3 className="mt-4 font-display text-lg font-semibold">Заказов пока нет</h3><Link href="/catalog" className="mt-3 inline-block text-sm text-deep">Перейти в каталог</Link></div></div> : orders.map((order) => { const status = STATUS[order.status] ?? { label: order.status, cls: 'border-bright bg-sand text-faint' }; return <Link key={order.id} href={`/account/orders/${order.id}`} className="grid gap-3 border-b border-linen px-5 py-4 last:border-0 hover:bg-sand sm:grid-cols-[150px_130px_1fr_auto] sm:items-center"><strong className="font-mono text-sm">#{order.id.slice(-8)}</strong><span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] ${status.cls}`}>{status.label}</span><span className="text-sm text-faint">{order.fulfillmentType ?? order.channel}</span><strong className="font-display text-lg">{som(order.total)}</strong></Link>; })}</div></section>
    </main>
    <SiteFooter />
    </div>
  </>;
}
