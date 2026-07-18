'use client';

import { Sparkles } from 'lucide-react';

const SEGMENTS = [
  { icon: '👥', count: '4 210', label: 'Всего клиентов' },
  { icon: '⭐', count: '128', label: 'VIP / Gold' },
  { icon: '😴', count: '340', label: 'Уснувшие' },
  { icon: '🎂', count: '19', label: 'ДР на неделе' },
];

/** CRM cockpit matching AliStore ERP 2.0 design. */
export function CrmView({ onOpenCampaigns }: { onOpenCampaigns?: () => void }) {
  return (
    <div className="space-y-4">
      <header className="border-b border-surface-3 pb-4"><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · CRM 3.0</div><h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Клиенты и CRM</h1><p className="mt-1 text-xs leading-5 text-subtle">Сегменты, удержание и персональные кампании магазина.</p></header>
      {/* segments */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {SEGMENTS.map((s) => (
          <div
            key={s.label}
            className="rounded-[14px] border p-4"
            style={{ background: '#1A1611', borderColor: '#2E2822' }}
          >
            <div className="text-[22px] leading-none">{s.icon}</div>
            <div className="mt-2 font-display text-[22px] font-extrabold text-white">
              {s.count}
            </div>
            <div className="mt-1 text-xs" style={{ color: '#8A7F76' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* AI recommendation */}
      <div
        className="rounded-[16px] border p-5"
        style={{
          background: 'linear-gradient(135deg,#2A2A2E,#1A1611)',
          borderColor: '#2E2822',
        }}
      >
        <div className="mb-2 flex items-center gap-2 font-mono text-xs" style={{ color: '#C6FF3D' }}>
          <Sparkles size={14} />
          AI РЕКОМЕНДАЦИЯ
        </div>
        <div className="text-[14px] leading-relaxed text-white">
          340 клиентов не покупали 60+ дней. Запустить кампанию реактивации со скидкой
          −10% через WhatsApp — прогноз возврата ~12%.
        </div>
        <button
          type="button"
          onClick={onOpenCampaigns}
          className="mt-4 px-[18px] py-2.5 text-[13px] font-bold transition hover:brightness-110"
          style={{ background: '#C6FF3D', color: '#14110E', borderRadius: '10px' }}
        >
          Открыть кампании →
        </button>
      </div>
    </div>
  );
}
