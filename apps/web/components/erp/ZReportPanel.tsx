'use client';

import { useState } from 'react';
import { fetchZReport, type ZReport } from '@/lib/reports';
import { som } from '@/lib/format';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  qr_mbank: 'QR MBank',
  qr_odengi: 'QR O!Деньги',
  bakai_pos: 'Bakai POS',
  obank: 'O!Bank',
  installment: 'Рассрочка',
  gift_card: 'Подарочная карта',
};

/**
 * Z-report — the owner's end-of-day till summary for one business day. Reads the
 * server aggregate (`GET /reports/z-report`); it is informational until a
 * certified OFD issues the real fiscal Z-report.
 */
export function ZReportPanel({ accessToken }: { accessToken: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ZReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchZReport(date, accessToken));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить Z-отчёт');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'h-10 rounded-[8px] border border-surface-3 bg-surface px-3 text-sm text-white outline-none focus:border-faint';

  return (
    <section className="rounded-[16px] border border-surface-3 bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="font-display text-[15px] font-bold">Z-отчёт · суточный итог кассы</div>
        <div className="ml-auto flex items-center gap-2">
          <input type="date" aria-label="Дата Z-отчёта" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          <button type="button" disabled={loading} onClick={() => void load()} className="rounded-btn bg-lime px-4 py-2 text-sm font-extrabold text-lime-ink disabled:opacity-50">
            {loading ? 'Загрузка…' : 'Показать'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger-soft">{error}</p>}

      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Metric label="Смен закрыто" value={String(report.totals.shifts)} />
            <Metric label="Продажи" value={som(report.totals.salesTotal)} />
            <Metric label="Инкассация" value={som(report.totals.incassationTotal)} />
            <Metric label="Расхождение" value={som(report.totals.varianceTotal)} danger={report.totals.varianceTotal !== 0} />
          </div>

          {Object.keys(report.totals.salesByMethod).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.totals.salesByMethod).map(([method, amount]) => (
                <span key={method} className="rounded-chip bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
                  {METHOD_LABEL[method] ?? method}: <span className="text-white">{som(amount)}</span>
                </span>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th className="px-3 py-2 font-medium">Точка</th>
                  <th className="px-3 py-2 font-medium">Закрыта</th>
                  <th className="px-3 py-2 font-medium text-right">Открытие</th>
                  <th className="px-3 py-2 font-medium text-right">Закрытие</th>
                  <th className="px-3 py-2 font-medium text-right">Расхождение</th>
                </tr>
              </thead>
              <tbody>
                {report.shifts.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-faint">За этот день закрытых смен нет</td></tr>
                )}
                {report.shifts.map((shift) => (
                  <tr key={shift.id} className="border-t border-surface-3">
                    <td className="px-3 py-2 text-white">{shift.point}</td>
                    <td className="px-3 py-2 text-muted">{shift.closedAt ? new Date(shift.closedAt).toLocaleString('ru-RU') : '—'}</td>
                    <td className="px-3 py-2 text-right text-muted">{som(shift.openCash)}</td>
                    <td className="px-3 py-2 text-right text-muted">{shift.closeCash === null ? '—' : som(shift.closeCash)}</td>
                    <td className={`px-3 py-2 text-right ${shift.diff ? 'text-danger-soft' : 'text-muted'}`}>{shift.diff === null ? '—' : som(shift.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2">
      <div className="text-[11px] text-faint">{label}</div>
      <div className={`mt-0.5 font-semibold ${danger ? 'text-danger-soft' : 'text-white'}`}>{value}</div>
    </div>
  );
}
