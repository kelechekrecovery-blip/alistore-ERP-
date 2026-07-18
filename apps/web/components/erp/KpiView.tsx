'use client';

import { Card } from './Card';
import { som } from '@/lib/format';
import type { Kpi } from '@/lib/reports';

interface StaffRow {
  name: string;
  sales: string;
  kpi: string;
  kpiBg: string;
  kpiFg: string;
  bonus: string;
  pen: string;
  penColor: string;
}

const STAFF: StaffRow[] = [
  { name: 'Азизбек', sales: '620к', kpi: '96%', kpiBg: 'rgba(198,255,61,0.12)', kpiFg: '#C6FF3D', bonus: '+13 800', pen: '−1 000', penColor: '#FF8A7A' },
  { name: 'Сайкал', sales: '540к', kpi: '88%', kpiBg: 'rgba(198,255,61,0.12)', kpiFg: '#C6FF3D', bonus: '+9 200', pen: '0', penColor: '#8A7F76' },
  { name: 'Сыдык', sales: '410к', kpi: '74%', kpiBg: 'rgba(229,178,60,0.15)', kpiFg: '#E5B23C', bonus: '+4 100', pen: '−2 000', penColor: '#FF8A7A' },
  { name: 'Риезидин', sales: '480к', kpi: '82%', kpiBg: 'rgba(198,255,61,0.12)', kpiFg: '#C6FF3D', bonus: '+7 400', pen: '0', penColor: '#8A7F76' },
  { name: 'Тахсир', sales: '390к', kpi: '71%', kpiBg: 'rgba(229,178,60,0.15)', kpiFg: '#E5B23C', bonus: '+3 800', pen: '0', penColor: '#8A7F76' },
  { name: 'Али', sales: '560к', kpi: '91%', kpiBg: 'rgba(198,255,61,0.12)', kpiFg: '#C6FF3D', bonus: '+11 200', pen: '0', penColor: '#8A7F76' },
];

/** KPI / payroll table matching AliStore ERP 2.0 design. */
export function KpiView({ kpi }: { kpi: Kpi | null; accessToken: string }) {
  return (
    <div className="space-y-4"><header className="border-b border-surface-3 pb-4"><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Analytics 3.0</div><h1 className="font-display text-2xl font-extrabold tracking-tight text-white">KPI команды</h1><p className="mt-1 text-xs leading-5 text-subtle">Продажи, бонусы и качество работы по сотрудникам.</p></header><Card>
      <div className="mb-3.5 font-display text-[15px] font-bold text-white">KPI продавцов</div>
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] border-b border-surface-3 pb-2 text-xs text-subtle">
        <span>Сотрудник</span>
        <span className="text-right">Продажи</span>
        <span className="text-right">KPI</span>
        <span className="text-right">Бонус</span>
        <span className="text-right">Штраф</span>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        {STAFF.map((s) => (
          <div
            key={s.name}
            className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center border-b border-surface-2 py-3.5 text-[13px] last:border-0"
          >
            <span className="truncate pr-2 text-white">{s.name}</span>
            <span className="text-right font-mono text-bright">{s.sales}</span>
            <span className="flex justify-end">
              <span
                className="rounded-chip px-2 py-0.5 font-mono text-[12px]"
                style={{ background: s.kpiBg, color: s.kpiFg }}
              >
                {s.kpi}
              </span>
            </span>
            <span className="text-right font-mono text-lime">{s.bonus}</span>
            <span className="text-right font-mono" style={{ color: s.penColor }}>{s.pen}</span>
          </div>
        ))}
      </div>
    </Card></div>
  );
}
