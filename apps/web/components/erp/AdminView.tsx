'use client';

import Link from 'next/link';
import { Card } from './Card';
import { StaffAdminView } from './StaffAdminView';
import { staffCan } from '@/lib/staff-permissions';

type AdminViewProps = {
  role: string;
  username: string;
  accessToken: string;
  onNavigate: (route: 'campaigns' | 'storefront') => void;
};

const MODULES = [
  { href: '/approvals', icon: '✓', title: 'Согласования и 2FA', description: 'Скидки, возвраты, списания и опасные действия', roles: ['admin', 'owner', 'senior_seller'] },
  { href: '/warehouse', icon: '□', title: 'Склад и IMEI', description: 'Приемка, остатки, движения, назначения и документы', roles: ['admin', 'owner', 'warehouse'] },
  { href: '/pos', icon: '▣', title: 'POS и касса', description: 'Продажи, смены, возвраты, печать и сверка', roles: ['admin', 'owner', 'cashier', 'seller', 'senior_seller'] },
  { href: '/staff', icon: '♙', title: 'Staff и операции', description: 'Задачи, заказы, Customer 360, поддержка и гарантия', roles: ['admin', 'owner', 'seller', 'warehouse', 'service', 'technician'] },
  { href: '/', icon: '↗', title: 'Клиентская витрина', description: 'Открыть сайт и проверить опубликованный каталог', roles: ['admin', 'owner', 'marketer'] },
] as const;

const INTERNAL_MODULES = [
  { route: 'storefront' as const, icon: '▤', title: 'Админка сайта', description: 'Товары, баннеры, контент, промокоды, отзывы и публикации', roles: ['admin', 'owner', 'marketer'] },
  { route: 'campaigns' as const, icon: '◌', title: 'Кампании и промо', description: 'Сегменты, промокоды, согласования и ROI', roles: ['admin', 'owner', 'marketer'] },
];

export function AdminView({ role, username, accessToken, onNavigate }: AdminViewProps) {
  const visible = MODULES.filter((module) => (module.roles as readonly string[]).includes(role));
  const internal = INTERNAL_MODULES.filter((module) => module.roles.includes(role));
  return (
    <div className="max-w-6xl space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-3 pb-5">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Центр управления</div>
          <h2 className="font-display text-2xl font-bold">Администрирование AliStore</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Все служебные разделы сайта, кассы и склада доступны из единого ERP-контекста.</p>
        </div>
        <div className="rounded-[8px] border border-surface-3 bg-surface px-4 py-3 text-right text-xs">
          <div className="text-subtle">Текущая сессия</div>
          <strong className="mt-1 block text-lime">{username}</strong>
          <span className="text-muted">{role}</span>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((module) => (
          <Link key={module.href} href={module.href} className="group rounded-[8px] border border-surface-3 bg-surface p-4 transition hover:border-lime/60 hover:bg-surface-2">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] bg-surface-3 text-lg text-lime">{module.icon}</span>
              <span className="min-w-0">
                <strong className="block text-sm text-white group-hover:text-lime">{module.title}</strong>
                <span className="mt-1 block text-xs leading-5 text-subtle">{module.description}</span>
              </span>
              <span className="ml-auto text-subtle">→</span>
            </div>
          </Link>
        ))}
        {internal.map((module) => (
          <button
            key={module.route}
            type="button"
            onClick={() => onNavigate(module.route)}
            aria-label={module.route === 'storefront' ? 'Админка сайта · Сайт · CMS витрины' : module.title}
            className="group rounded-[8px] border border-surface-3 bg-surface p-4 text-left transition hover:border-lime/60 hover:bg-surface-2"
          >
            <span className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] bg-surface-3 text-lg text-lime">{module.icon}</span>
              <span className="min-w-0">
                <strong className="block text-sm text-white group-hover:text-lime">{module.title}</strong>
                <span className="mt-1 block text-xs leading-5 text-subtle">{module.description}</span>
              </span>
              <span className="ml-auto text-subtle">→</span>
            </span>
          </button>
        ))}
      </div>

      {!visible.length && <Card><p className="text-sm text-coral-tint">Для роли {role} нет административных разделов.</p></Card>}

      {staffCan(role, 'staff', 'manage') && <StaffAdminView accessToken={accessToken} />}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-display text-[15px] font-bold">Контур доступа</h3><p className="mt-1 text-xs text-subtle">Доступ ограничен staff JWT и серверным RBAC. Ссылки не расширяют права пользователя.</p></div>
          <Link href="/" className="rounded-[6px] border border-line px-3 py-2 text-xs text-bright hover:border-lime hover:text-lime">Открыть витрину</Link>
        </div>
      </Card>
    </div>
  );
}
