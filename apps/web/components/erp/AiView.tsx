'use client';

import { useState } from 'react';
import type { Insight } from '@/lib/reports';

interface ChatMessage {
  q: boolean;
  text: string;
}

const PROMPTS = [
  { label: 'Выручка за сегодня', answer: 'Сегодня 1.24 млн сом (+12%), 47 чеков, средний чек 26 400. Лучший филиал — Центр.' },
  { label: 'Что закупить?', answer: 'Заканчивается iPhone 15 (2 дня) и Apple Watch S9 (критично, 2 шт). Рекомендую закупку на 3.2 млн — оформить?' },
  { label: 'Лучший продавец', answer: 'Азизбек: 620к продаж, KPI 96%. Начислить бонус 13 800 сом?' },
];

/** Owner AI assistant chat matching AliStore ERP 2.0 design. */
export function AiView({ insights: _insights }: { insights: Insight[] | null }) {
  const [chat, setChat] = useState<ChatMessage[]>([
    { q: false, text: 'Я вижу все данные сети. Спросите про деньги, склад, сотрудников или задачи.' },
  ]);

  function ask(prompt: { label: string; answer: string }) {
    setChat((current) => [
      ...current,
      { q: true, text: prompt.label },
      { q: false, text: prompt.answer },
    ]);
  }

  return (
    <div className="max-w-[720px]">
      <header className="mb-5 border-b border-surface-3 pb-4"><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · AI 3.0</div><h1 className="font-display text-2xl font-extrabold tracking-tight text-white">AI-ассистент</h1><p className="mt-1 text-xs leading-5 text-subtle">Рекомендации по продажам, складу и команде. Решение всегда подтверждает сотрудник.</p></header>
      {chat.map((c, index) => (
        <div key={index} className={`mb-3 flex ${c.q ? 'justify-end' : 'justify-start'}`}>
          <div
            className="max-w-[78%] px-4 py-[13px] text-[14px] leading-relaxed"
            style={{
              background: c.q ? '#FF5B2E' : '#221E19',
              color: c.q ? '#fff' : '#E5DCD3',
              borderRadius: c.q ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            }}
          >
            {c.text}
          </div>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => ask(p)}
            className="rounded-full border border-[#2E2822] bg-[#221E19] px-[15px] py-[9px] text-[13px] text-[#C6FF3D] transition hover:border-[#C6FF3D]"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
