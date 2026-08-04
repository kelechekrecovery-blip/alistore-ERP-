'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { Card } from './Card';

interface AsyncPanelProps<T> {
  /** null while loading — the same convention the ERP views already use. */
  data: T | null;
  error: string;
  onRetry: () => void;
  /** True when the request succeeded but there is genuinely nothing to show. */
  isEmpty?: (data: T) => boolean;
  emptyText?: string;
  loadingText?: string;
  children: (data: T) => React.ReactNode;
}

/**
 * Loading / empty / error — three states that must never look alike.
 *
 * ERP screens used to collapse them into one: on a failed request they either
 * rendered an empty state ("Пусто", indistinguishable from "nothing to do") or
 * silently substituted `DEFAULT_*` fixtures — invented couriers, staff and a
 * payroll run — so an owner could not tell live data from a mock. This panel
 * makes the three cases structurally distinct and always offers a way back.
 */
export function AsyncPanel<T>({
  data,
  error,
  onRetry,
  isEmpty,
  emptyText = 'Пока нет данных',
  loadingText = 'Загрузка…',
  children,
}: AsyncPanelProps<T>) {
  if (error) {
    return (
      <Card className="p-5">
        <p role="alert" className="text-sm text-danger-soft">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[8px] border border-surface-3 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-coral"
        >
          <RefreshCw size={12} /> Повторить
        </button>
      </Card>
    );
  }

  if (data === null) {
    return (
      <Card className="p-5">
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> {loadingText}
        </p>
      </Card>
    );
  }

  if (isEmpty?.(data)) {
    return <Card className="p-5"><p className="text-sm text-muted">{emptyText}</p></Card>;
  }

  return <>{children(data)}</>;
}
