'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { previewCampaign } from '@/lib/api/campaigns';
import { fetchTickets, type Ticket } from '@/lib/crm';
import type { RiskSignal } from '@/lib/reports';
import { AsyncPanel } from './AsyncPanel';
import { CustomerCard } from './CustomerCard';

interface Props {
  accessToken: string;
  /** Уже загружены страницей ERP — второй раз за ними не ходим. */
  risks: RiskSignal[] | null;
  onOpenCampaigns?: () => void;
}

/**
 * Порог уровня Gold. Держится в одной цифре с сервером: `loyaltyLevel()` в
 * `apps/api/src/customers/customers.service.ts` присваивает Gold от 300 000
 * сом LTV. Своё число здесь означало бы, что плитка и карточка лояльности
 * клиента показывают разные вещи.
 */
const GOLD_LTV = 300_000;

/** Сигналы Risk Center, относящиеся к работе с клиентами. */
const CRM_SIGNAL_KINDS = new Set(['ticket_sla_breach', 'debt_overdue', 'repeat_returns']);

interface Tiles {
  totalCustomers: number;
  excludedNoConsent: number;
  goldByLtv: number;
}

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'border-coral text-coral-tint',
  high: 'border-warn/40 text-warn',
  normal: 'border-line text-muted',
};

/**
 * Клиенты и CRM.
 *
 * Здесь были четыре плитки-литерала («4 210 клиентов», «128 VIP», «340
 * уснувших», «19 ДР на неделе») и блок «AI РЕКОМЕНДАЦИЯ» с прогнозом
 * возврата ~12%. Ни одна цифра ниоткуда не бралась, а двух из них не могло
 * быть в принципе: давности покупки нет в правилах сегментации, поля дня
 * рождения нет в модели Customer.
 *
 * Плитки теперь считает сервер тем же вызовом, что и предпросмотр кампании,
 * сигналы приходят из Risk Center, обращения — из инбокса поддержки.
 */
export function CrmView({ accessToken, risks, onOpenCampaigns }: Props) {
  const [tiles, setTiles] = useState<Tiles | null>(null);
  const [tilesError, setTilesError] = useState('');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticketsError, setTicketsError] = useState('');
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);

  const loadTiles = useCallback(async () => {
    setTilesError('');
    try {
      // limit: 1 обрезает только выборку audience — счётчики сервер считает по
      // всей базе независимо от лимита.
      const [all, gold] = await Promise.all([
        previewCampaign({ limit: 1 }, accessToken),
        previewCampaign({ minLtv: GOLD_LTV, limit: 1 }, accessToken),
      ]);
      setTiles({
        totalCustomers: all.totalCustomers,
        excludedNoConsent: all.excludedNoConsent,
        goldByLtv: gold.matchedCustomers,
      });
    } catch (cause) {
      setTiles(null);
      const detail = cause instanceof Error ? cause.message : '';
      setTilesError(detail ? `Не удалось посчитать сегменты: ${detail}` : 'Не удалось посчитать сегменты');
    }
  }, [accessToken]);

  const loadTickets = useCallback(async () => {
    setTicketsError('');
    try { setTickets(await fetchTickets(undefined, accessToken)); }
    catch (cause) {
      setTickets(null);
      const detail = cause instanceof Error ? cause.message : '';
      setTicketsError(detail ? `Не удалось загрузить обращения: ${detail}` : 'Не удалось загрузить обращения');
    }
  }, [accessToken]);

  useEffect(() => { void loadTiles(); void loadTickets(); }, [loadTiles, loadTickets]);

  const crmSignals = (risks ?? []).filter((signal) => CRM_SIGNAL_KINDS.has(signal.kind));

  return (
    <div className="space-y-4">
      <header className="border-b border-surface-3 pb-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · CRM 3.0</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Клиенты и CRM</h1>
        <p className="mt-1 text-xs leading-5 text-subtle">Сегменты, обращения и карточка клиента.</p>
      </header>

      <AsyncPanel data={tiles} error={tilesError} onRetry={() => void loadTiles()} loadingText="Считаем сегменты…">
        {(data) => (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {[
              { value: data.totalCustomers, label: 'Всего клиентов', hint: 'вся база' },
              { value: data.goldByLtv, label: `LTV от ${GOLD_LTV.toLocaleString('ru-RU')} с`, hint: 'порог уровня Gold' },
              { value: data.excludedNoConsent, label: 'Без согласия на рассылку', hint: 'кампании их не увидят' },
            ].map((tile) => (
              <div key={tile.label} className="rounded-[14px] border border-surface-3 bg-ink-dark p-4">
                <div className="font-display text-[22px] font-extrabold tabular-nums text-white">{tile.value.toLocaleString('ru-RU')}</div>
                <div className="mt-1 text-xs text-muted">{tile.label}</div>
                <div className="mt-0.5 text-[10px] text-subtle">{tile.hint}</div>
              </div>
            ))}
          </div>
        )}
      </AsyncPanel>

      <section className="rounded-[14px] border border-surface-3 bg-ink-dark p-5" aria-labelledby="crm-signals-title">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-warn" />
          <h2 id="crm-signals-title" className="font-display text-sm font-bold">Клиентские сигналы</h2>
          <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-subtle">из Risk Center</span>
        </div>
        {crmSignals.length === 0 ? (
          <p className="mt-3 text-xs text-subtle">
            {risks === null ? 'Сигналы ещё загружаются…' : 'Просроченных обращений, долгов и повторных возвратов нет.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {crmSignals.map((signal) => (
              <li key={`${signal.kind}-${signal.ref}`} className="flex items-start gap-2 border-t border-surface-3 pt-2 text-xs">
                <span className={`mt-1 h-1.5 w-1.5 flex-none rounded-full ${signal.severity === 'high' ? 'bg-coral' : 'bg-warn'}`} aria-hidden />
                <span className="text-sand">{signal.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {onOpenCampaigns && (
          <button type="button" onClick={onOpenCampaigns} className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-lime px-[18px] py-2.5 text-[13px] font-bold text-coal transition hover:brightness-110">
            Открыть кампании <ArrowRight size={14} />
          </button>
        )}
      </section>

      <section aria-labelledby="crm-tickets-title">
        <h2 id="crm-tickets-title" className="mb-2 font-display text-sm font-bold">Обращения</h2>
        <AsyncPanel
          data={tickets}
          error={ticketsError}
          onRetry={() => void loadTickets()}
          loadingText="Загружаем обращения…"
          isEmpty={(list) => list.length === 0}
          emptyText="Открытых обращений нет."
        >
          {(list) => (
            <ul className="divide-y divide-surface-3 overflow-hidden rounded-[14px] border border-surface-3 bg-ink-dark">
              {list.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setOpenCustomer((current) => (current === ticket.customerId ? null : ticket.customerId))}
                    className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left text-xs transition hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1 truncate text-white">{ticket.subject}</span>
                    <span className={`rounded-[5px] border px-2 py-0.5 text-[10px] ${PRIORITY_STYLE[ticket.priority] ?? PRIORITY_STYLE.normal}`}>{ticket.priority}</span>
                    <span className="text-[10px] text-subtle">{ticket.status}</span>
                    <span className="text-[10px] text-subtle">SLA {ticket.sla}</span>
                  </button>
                  {openCustomer === ticket.customerId && (
                    <div className="px-4 pb-4">
                      <CustomerCard customerId={ticket.customerId} accessToken={accessToken} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AsyncPanel>
      </section>
    </div>
  );
}
