'use client';

import type { Insight } from '@/lib/reports';

const TONE_COLOR: Record<string, string> = { positive: '#C6FF3D', warning: '#FF8A7A', info: '#8A7F76' };
const TONE_ICON: Record<string, string> = { positive: '✓', warning: '⚠', info: 'ℹ' };

/** Owner AI assistant — ledger-derived insight cards (Phase 11, keyless rule engine). */
export function AiView({ insights }: { insights: Insight[] | null }) {
  if (insights === null) return <p className="font-mono text-sm text-faint">Ассистент думает…</p>;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-2.5 rounded-[14px] border border-surface-3 bg-surface px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">🧠</span>
        <div>
          <div className="text-[13px] font-semibold">AI-ассистент владельца</div>
          <div className="text-[11px] text-subtle">Инсайты считаются из Event Ledger · подключите ключ LLM для развёрнутого разбора</div>
        </div>
      </div>
      {insights.length === 0 && <p className="text-sm text-subtle">Пока недостаточно данных для инсайтов.</p>}
      <div className="flex flex-col gap-2.5">
        {insights.map((i, idx) => (
          <div key={idx} className="flex gap-3 rounded-[14px] border border-surface-3 bg-surface p-4">
            <span className="mt-0.5 text-sm" style={{ color: TONE_COLOR[i.tone] }}>{TONE_ICON[i.tone] ?? '•'}</span>
            <div>
              <div className="text-[14px] font-semibold" style={{ color: i.tone === 'warning' ? TONE_COLOR.warning : '#fff' }}>{i.title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-muted">{i.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
