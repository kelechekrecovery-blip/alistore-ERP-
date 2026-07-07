'use client';

import Link from 'next/link';
import { MobileAppFrame } from '@/components/MobileAppFrame';

const coupons = [
  { icon: '🎂', title: 'Скидка ко дню рождения', expiry: 'до 20 июля', value: '-15%' },
  { icon: '🎧', title: 'Скидка на аксессуары', expiry: 'до 31 июля', value: '-10%' },
  { icon: '⚡', title: 'Быстрая доставка', expiry: 'на следующий заказ', value: '0 с' },
];

const history = [
  { label: 'Покупка iPhone 15', amount: '+1 099', cls: 'text-lime' },
  { label: 'Отзыв с фото', amount: '+300', cls: 'text-lime' },
  { label: 'Списано за AirPods', amount: '-2 000', cls: 'text-[#FF8A7A]' },
];

export default function BonusesPage() {
  return (
    <MobileAppFrame title="Бонусы и купоны" subtitle="1 бонус = 1 сом. Купоны применяются в корзине." backHref="/account">
      <div className="rounded-[18px] bg-gradient-to-br from-coral to-deep p-5 text-center">
        <div className="text-[13px] text-[#FFE0D5]">Доступно бонусов</div>
        <div className="mt-1 font-display text-[40px] font-extrabold leading-none">4 820</div>
        <div className="mt-2 text-[12px] text-[#FFE0D5]">Gold · до Platinum осталось 51 000 с покупок</div>
      </div>

      <div className="mt-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="mb-2 flex justify-between text-[13px]"><span className="text-[#D8CFC6]">Прогресс уровня</span><span className="font-mono text-lime">72%</span></div>
        <div className="h-[7px] overflow-hidden rounded-chip bg-[#16130F]"><div className="h-full w-[72%] bg-gradient-to-r from-[#C6FF3D] to-[#8FD40F]" /></div>
      </div>

      <div className="mb-2 mt-4 text-[13px] text-[#A79C92]">Мои купоны</div>
      {coupons.map((c) => (
        <div key={c.title} className="mb-2 flex items-center gap-3 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
          <span className="text-2xl">{c.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{c.title}</div>
            <div className="mt-0.5 text-[11px] text-[#8A7F76]">{c.expiry}</div>
          </div>
          <span className="rounded-[8px] bg-lime px-3 py-1.5 text-[12px] font-bold text-lime-ink">{c.value}</span>
        </div>
      ))}

      <Link href="/cart" className="mt-3 block rounded-[13px] bg-lime py-3.5 text-center text-[14px] font-bold text-lime-ink">Открыть корзину</Link>

      <div className="mb-2 mt-5 text-[13px] text-[#A79C92]">История</div>
      {history.map((h) => (
        <div key={h.label} className="flex justify-between border-b border-[#221E19] py-2.5 text-[13px]">
          <span className="text-[#A79C92]">{h.label}</span>
          <span className={`font-mono ${h.cls}`}>{h.amount}</span>
        </div>
      ))}
    </MobileAppFrame>
  );
}
