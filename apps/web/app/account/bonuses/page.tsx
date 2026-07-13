'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { fetchMyLoyalty, type CustomerLoyalty } from '@/lib/api';

export default function BonusesPage() {
  const { user, authed } = useAuth();
  const [data, setData] = useState<CustomerLoyalty | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    authed(fetchMyLoyalty).then(setData).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Не удалось загрузить бонусы'));
  }, [user, authed]);

  return (
    <MobileAppFrame title="Бонусы и купоны" subtitle="1 бонус = 1 сом. Баланс и купоны синхронизированы с аккаунтом." backHref="/account">
      {!user && <AccountNotice text="Войдите по OTP, чтобы увидеть бонусы." href="/login?next=/account/bonuses" />}
      {user && error && <AccountNotice text={error} />}
      {user && !data && !error && <div className="py-16 text-center text-sm text-[#A79C92]">Загружаем бонусы…</div>}
      {data && <>
        <div className="rounded-[18px] bg-coral p-5 text-center">
          <div className="text-[13px] text-[#FFE0D5]">Доступно бонусов</div>
          <div className="mt-1 font-display text-[40px] font-extrabold leading-none">{data.balance.toLocaleString('ru-RU')}</div>
          <div className="mt-2 text-[12px] text-[#FFE0D5]">1 бонус = {data.conversion} сом · {data.level}-уровень</div>
        </div>

        <div className="mb-2 mt-4 text-[13px] text-[#A79C92]">Мои купоны</div>
        {data.coupons.length === 0 && <Empty text="Активных купонов пока нет" />}
        {data.coupons.map((coupon) => (
          <div key={coupon.id} className="mb-2 flex items-center gap-3 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{coupon.title}</div>
              <div className="mt-0.5 font-mono text-[11px] text-[#8A7F76]">{coupon.code}</div>
            </div>
            <span className="rounded-[8px] bg-lime px-3 py-1.5 text-[12px] font-bold text-lime-ink">{coupon.valueLabel}</span>
          </div>
        ))}

        <Link href="/cart" className="mt-3 block rounded-[8px] bg-lime py-3.5 text-center text-[14px] font-bold text-lime-ink">Открыть корзину</Link>
        <div className="mb-2 mt-5 text-[13px] text-[#A79C92]">История</div>
        {data.history.length === 0 && <Empty text="Начислений пока нет" />}
        {data.history.map((entry) => (
          <div key={entry.id} className="flex justify-between border-b border-[#221E19] py-2.5 text-[13px]">
            <span className="text-[#A79C92]">{entry.label}</span>
            <span className={`font-mono ${entry.amount >= 0 ? 'text-lime' : 'text-[#FF8A7A]'}`}>{entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString('ru-RU')}</span>
          </div>
        ))}
      </>}
    </MobileAppFrame>
  );
}

function AccountNotice({ text, href }: { text: string; href?: string }) {
  const body = <div className="rounded-[13px] border border-[#2E2822] bg-[#221E19] p-4 text-sm text-[#A79C92]">{text}</div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[13px] border border-[#2E2822] bg-[#221E19] p-4 text-sm text-[#A79C92]">{text}</div>;
}
