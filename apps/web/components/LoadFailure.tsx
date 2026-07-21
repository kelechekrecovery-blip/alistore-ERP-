'use client';

import { RefreshCw } from 'lucide-react';

interface Props {
  /** Что именно не загрузилось — «товары», «избранное», «сравнение». */
  what: string;
  /** Причина от сервера, если она есть и её не стыдно показать. */
  detail?: string;
  onRetry: () => void;
  className?: string;
}

/**
 * Отказ загрузки на витрине.
 *
 * Раньше упавший запрос каталога приводил к `setProducts([])`, и покупатель
 * видел то же самое, что видит владелец пустого магазина: «Каталог
 * обновляется». Это неправда — каталог не обновляется, сервер недоступен, — и
 * из этого состояния нет выхода: ни кнопки, ни объяснения. Человек уходит,
 * решив, что торговать нечем.
 *
 * Пустой каталог и упавший запрос обязаны выглядеть по-разному.
 */
export function LoadFailure({ what, detail, onRetry, className = '' }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-[12px] border border-[#ff9a6e]/30 bg-[#ff9a6e]/[.06] px-6 py-10 text-center ${className}`}
    >
      <p className="text-[15px] font-semibold text-white">Не удалось загрузить {what}</p>
      <p className="mt-1 text-[13px] text-white/55">
        {detail || 'Похоже, у нас временные неполадки. Это не с вашей стороны.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-[#ff9a6e] px-4 py-2 text-[13px] font-bold text-[#1a1206] transition hover:brightness-110"
      >
        <RefreshCw size={14} /> Повторить
      </button>
    </div>
  );
}
