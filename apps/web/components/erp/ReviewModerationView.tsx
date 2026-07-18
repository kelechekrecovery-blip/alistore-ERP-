'use client';

import { Check, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchReviewModerationQueue,
  moderateProductReview,
  type ModeratedProductReview,
  type ProductReviewModerationStatus,
} from '@/lib/api';

const FILTERS: Array<{ value: ProductReviewModerationStatus; label: string }> = [
  { value: 'pending', label: 'Ожидают решения' },
  { value: 'approved', label: 'Опубликованы' },
  { value: 'rejected', label: 'Отклонены' },
];

export function ReviewModerationView({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState<ProductReviewModerationStatus>('pending');
  const [items, setItems] = useState<ModeratedProductReview[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function load(nextStatus = status) {
    setLoading(true);
    setNotice('');
    try {
      setItems((await fetchReviewModerationQueue(nextStatus, accessToken)).items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить отзывы');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(status); }, [status, accessToken]);

  async function decide(review: ModeratedProductReview, action: 'approve' | 'reject') {
    const reason = reasons[review.id]?.trim();
    if (action === 'reject' && !reason) {
      setNotice('Для отклонения укажите причину');
      return;
    }
    setBusyId(review.id);
    setNotice('');
    try {
      await moderateProductReview(review.id, { action, ...(reason ? { reason } : {}) }, accessToken);
      setItems((current) => current.filter((item) => item.id !== review.id));
      setNotice(action === 'approve' ? 'Отзыв опубликован на карточке товара' : 'Отзыв отклонён');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Решение не сохранено');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[8px] border border-surface-3 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-bold">Модерация отзывов</h2><p className="mt-1 text-xs text-subtle">На карточке товара видны только одобренные отзывы проверенных покупателей.</p></div>
        <button type="button" onClick={() => load()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-[7px] border border-line text-muted disabled:opacity-40" title="Обновить очередь"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setStatus(filter.value)} className={`rounded-[7px] border px-3 py-2 text-xs font-bold ${status === filter.value ? 'border-coral bg-coral text-white' : 'border-surface-3 bg-surface-2 text-muted'}`}>{filter.label}</button>)}
      </div>
      {notice && <p className="mt-4 text-sm text-warn">{notice}</p>}
      <div className="mt-4 grid gap-3">
        {!loading && items.length === 0 && <div className="rounded-[8px] border border-dashed border-line px-5 py-12 text-center text-sm text-subtle">В этой очереди отзывов нет.</div>}
        {items.map((review) => <article key={review.id} className="rounded-[8px] border border-surface-3 bg-ink-dark p-4">
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-white">{review.customerName}</b><span className="text-xs text-warn">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><span className="ml-auto text-xs text-subtle">{review.productName}</span></div>
          <p className="mt-2 text-sm leading-6 text-bright">{review.text || 'Покупатель оставил оценку без комментария.'}</p>
          <div className="mt-2 text-[11px] text-faint">{new Date(review.createdAt).toLocaleString('ru-RU')} · заказ {review.orderId}</div>
          {review.status === 'pending' ? <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]"><input value={reasons[review.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Причина отклонения" className="rounded-[7px] border border-surface-3 bg-surface-2 px-3 py-2 text-xs text-white outline-none focus:border-coral" /><button type="button" disabled={busyId === review.id} onClick={() => decide(review, 'approve')} className="inline-flex items-center justify-center gap-1.5 rounded-[7px] bg-lime px-3 py-2 text-xs font-bold text-lime-ink disabled:opacity-50"><Check size={14} /> Одобрить</button><button type="button" disabled={busyId === review.id} onClick={() => decide(review, 'reject')} className="inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-coral px-3 py-2 text-xs font-bold text-coral disabled:opacity-50"><X size={14} /> Отклонить</button></div> : <div className="mt-3 text-xs text-subtle">{review.status === 'approved' ? 'Опубликован' : `Отклонён: ${review.moderationReason ?? 'причина не указана'}`}</div>}
        </article>)}
      </div>
    </section>
  );
}
