'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSupplyOperations,
  visibleSupplyOperationRows,
  type SupplyOperationQueueKey,
  type SupplyOperationRow,
  type SupplyOperationsReport,
} from '@/lib/api';
import { som } from '@/lib/format';

export const SUPPLY_QUEUE_META: Record<SupplyOperationQueueKey, { label: string; tone: string }> = {
  awaiting_deposit: { label: 'Ждёт задатка', tone: 'text-[#E5B23C]' },
  draft_po: { label: 'Draft PO', tone: 'text-[#7DB8FF]' },
  late: { label: 'Задерживается', tone: 'text-danger-soft' },
  received: { label: 'Поступил', tone: 'text-[#7DB8FF]' },
  ready: { label: 'Готов', tone: 'text-lime' },
  cancellation_awaiting_owner: { label: 'Решение владельца', tone: 'text-[#E5B23C]' },
  refund_failed: { label: 'Ошибка возврата', tone: 'text-danger-soft' },
};

const QUEUE_ORDER = Object.keys(SUPPLY_QUEUE_META) as SupplyOperationQueueKey[];

export function SupplyOperationsQueue({ accessToken }: { accessToken: string }) {
  const [report, setReport] = useState<SupplyOperationsReport | null>(null);
  const [queue, setQueue] = useState<SupplyOperationQueueKey>('awaiting_deposit');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchSupplyOperations(accessToken));
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить операционные очереди');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleQueues = useMemo(
    () => QUEUE_ORDER.filter((key) => (
      report?.capabilities.financialQueuesVisible
      || (key !== 'cancellation_awaiting_owner' && key !== 'refund_failed')
    )),
    [report],
  );
  const rows = report ? visibleSupplyOperationRows(report, queue, search) : [];

  useEffect(() => {
    if (report && !visibleQueues.includes(queue)) {
      setQueue('awaiting_deposit');
    }
  }, [queue, report, visibleQueues]);

  return (
    <section className="mb-6 overflow-hidden rounded-[16px] border border-surface-3 bg-surface" data-testid="supply-operations-queue">
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-3 bg-ink-dark px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold">Заказы под поставку</h2>
          <p className="mt-0.5 text-[11px] text-subtle">Операционная очередь · данные только из backend</p>
        </div>
        <button
          type="button"
          aria-label="Обновить очередь поставок"
          disabled={loading}
          onClick={() => void refresh()}
          className="ml-auto grid h-9 w-9 place-items-center rounded-[8px] border border-surface-3 text-muted disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {report && (
        <div className="border-b border-surface-3 px-4 py-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Очереди заказов под поставку">
            {visibleQueues.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={queue === key}
                onClick={() => setQueue(key)}
                className={`rounded-[8px] border px-3 py-2 text-xs ${queue === key ? 'border-coral bg-coral/10 text-white' : 'border-surface-3 text-muted'}`}
              >
                {SUPPLY_QUEUE_META[key].label}
                <span className={`ml-2 font-mono ${SUPPLY_QUEUE_META[key].tone}`}>{report.counts[key]}</span>
              </button>
            ))}
          </div>
          <input
            aria-label="Поиск в очереди поставок"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Заказ, PO или SKU"
            className="mt-3 h-9 w-full max-w-sm rounded-[8px] border border-surface-3 bg-night px-3 text-xs text-white outline-none focus:border-faint"
          />
        </div>
      )}

      {loading && (
        <div role="status" className="p-8 text-center text-sm text-subtle">
          Загружаю операционные очереди…
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-[8px] border border-danger-soft/40 bg-danger-soft/10 px-3 py-3 text-sm text-danger-soft">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="rounded-[6px] border border-danger-soft/50 px-3 py-1.5 text-xs font-semibold">
            Повторить
          </button>
        </div>
      )}
      {!loading && report && rows.length === 0 && (
        <div className="p-8 text-center text-sm text-subtle">
          {search.trim() ? 'По вашему фильтру ничего не найдено' : 'В этой очереди сейчас нет заказов'}
        </div>
      )}
      {!loading && report && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Заказ</th>
                <th className="px-4 py-2 font-medium">PO / SKU</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2 font-medium text-right">Сумма / кол-во</th>
                <th className="px-4 py-2 font-medium">Срок</th>
                <th className="px-4 py-2 font-medium text-right">Детали</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.queue}:${row.id}`} id={`supply-order-${row.orderId}`} className="border-t border-surface-3">
                  <td className="px-4 py-3 font-mono text-white">№{row.orderId.slice(-8)}</td>
                  <td className="px-4 py-3">
                    <strong className="block text-bright">{row.purchaseOrderNumber ?? 'Без PO'}</strong>
                    <span className="text-subtle">{row.sku ?? '—'}</span>
                  </td>
                  <td className={`px-4 py-3 ${SUPPLY_QUEUE_META[row.queue].tone}`}>{SUPPLY_QUEUE_META[row.queue].label}</td>
                  <td className="px-4 py-3 text-right font-mono text-bright">
                    {row.amount !== null ? som(row.amount) : row.quantity !== null ? `${row.quantity} шт.` : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.expectedAt ? new Date(row.expectedAt).toLocaleDateString('ru-RU', { timeZone: 'Asia/Bishkek' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={row.detailHref} className="font-semibold text-coral-tint hover:text-white">
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && (
        <div className="border-t border-surface-3 px-4 py-3 text-[11px] text-subtle">
          {!report.flags['supply.to_order_checkout'].enabled && <span className="mr-3">Новый checkout выключен</span>}
          {!report.flags['supply.cancellation'].enabled && <span className="mr-3">Отмены выключены</span>}
          {report.capabilities.financialQueuesVisible && !report.capabilities.ownerResolutionAvailable && (
            <span>Решение владельца пока доступно только для просмотра; команда включается отдельным release-флагом.</span>
          )}
        </div>
      )}
    </section>
  );
}
