'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EvidencePicker } from '@/components/EvidencePicker';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { fetchMyOrders, openReturnRequest, uploadEvidenceImages, type MyOrder, type ReturnRequest } from '@/lib/api';
import { som } from '@/lib/format';

const reasons = ['Не подошёл / передумал', 'Брак / не работает', 'Не соответствует описанию', 'Пришёл не тот товар'];
const BLOCKED = new Set(['cancelled', 'returned', 'refunded']);

export default function ReturnsPage() {
  const router = useRouter();
  const { user, hydrated, authed } = useAuth();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState('');
  const [orderId, setOrderId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ret: ReturnRequest; evidenceCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (hydrated && !user) router.replace('/login?next=/account/returns'); }, [hydrated, user, router]);
  useEffect(() => {
    if (!user) return;
    authed(fetchMyOrders).then((list) => {
      setOrders(list);
      const first = list.find((o) => !BLOCKED.has(o.status));
      if (first) selectOrder(first);
      // `setOrders([])` печатал «Нет заказов для возврата» — покупатель уходил
      // с уверенностью, что вернуть товар нельзя, хотя список не загрузился.
    }).catch((cause) => setOrdersError(cause instanceof Error ? cause.message : 'Не удалось загрузить заказы'));
  }, [user, authed]);

  const eligible = useMemo(() => (orders ?? []).filter((o) => !BLOCKED.has(o.status)), [orders]);
  const selected = eligible.find((o) => o.id === orderId) ?? null;

  function selectOrder(order: MyOrder) {
    setOrderId(order.id);
    setQuantities(Object.fromEntries(order.items.map((item) => [item.id, item.qty])));
  }

  function setItemQty(itemId: string, qty: number, max: number) {
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(max, qty)) }));
  }

  async function submit() {
    if (!orderId || !reason) return;
    setBusy(true);
    setError(null);
    try {
      const ret = await authed((token) => openReturnRequest({
        orderId,
        reason: photoNote.trim() ? `${reason}; фото/комментарий: ${photoNote.trim()}` : reason,
        requester: user?.customerId ?? 'customer_app',
        items: selected?.items
          .filter((item) => (quantities[item.id] ?? 0) > 0)
          .map((item) => ({ orderItemId: item.id, qty: quantities[item.id] })) ?? [],
      }, token));
      const evidence = files.length
        ? await uploadEvidenceImages({
            files,
            entityType: 'return',
            entityId: ret.id,
            label: 'return_photo',
            actor: user?.customerId ?? 'customer_app',
            accessToken: await authed(async (token) => token),
          })
        : [];
      setDone({ ret, evidenceCount: evidence.length });
    } catch {
      setError('Не удалось отправить заявку или загрузить фото. Проверьте заказ и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-ink-dark font-mono text-sm text-subtle">Загрузка…</div>;
  }

  if (done) {
    return (
      <MobileAppFrame title="Возврат товара" subtitle={`Заявка ${done.ret.id.slice(-8)} принята.`} backHref="/account">
        <div className="py-7 text-center">
          <div className="mx-auto grid h-18 w-18 place-items-center rounded-full bg-lime/15 text-4xl" style={{ height: 72, width: 72 }}>✓</div>
          <div className="mt-4 font-display text-lg font-bold">Заявка отправлена</div>
          <div className="mt-2 text-[13px] leading-relaxed text-muted">Рассмотрим за 24 часа. Статус придёт в уведомления и Support Inbox.</div>
          <div className="mt-2 font-mono text-[12px] text-lime">Evidence Vault: {done.evidenceCount} фото</div>
        </div>
        <div className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <Step active label="Заявка принята" />
          <Step label="Проверка товара" />
          <Step label="Возврат денег" />
        </div>
        <Link href="/account" className="mt-4 block rounded-[13px] bg-lime py-3.5 text-center text-[14px] font-bold text-lime-ink">Готово</Link>
      </MobileAppFrame>
    );
  }

  return (
    <MobileAppFrame title="Возврат товара" subtitle="Выберите заказ, причину и отправьте заявку на проверку." backHref="/account">
      {ordersError && (
        <div className="rounded-[14px] border border-danger-soft/40 bg-danger-soft/10 p-5 text-center">
          <div className="font-display text-base font-bold">Заказы не загрузились</div>
          <p className="mt-1 text-sm text-subtle">{ordersError}</p>
          <p className="mt-1 text-sm text-muted">Это не значит, что вернуть нечего — попробуйте ещё раз.</p>
        </div>
      )}
      {!ordersError && orders === null && <p className="font-mono text-sm text-subtle">Загрузка заказов…</p>}
      {!ordersError && orders && eligible.length === 0 && (
        <div className="rounded-[14px] border border-surface-3 bg-surface-2 p-5 text-center">
          <div className="font-display text-base font-bold">Нет заказов для возврата</div>
          <Link href="/" className="mt-3 inline-block text-sm text-lime">В каталог</Link>
        </div>
      )}

      {eligible.length > 0 && (
        <>
          <div className="mb-2 text-[13px] text-muted">Заказ</div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {eligible.map((o) => (
              <button key={o.id} type="button" onClick={() => selectOrder(o)} className={`w-[170px] flex-shrink-0 rounded-[13px] border bg-surface-2 p-3 text-left ${orderId === o.id ? 'border-lime' : 'border-surface-3'}`}>
                <div className="font-mono text-[12px] font-bold">#{o.id.slice(-8)}</div>
                <div className="mt-1 text-[11px] text-subtle">{o.status} · {o.items.length} поз.</div>
                <div className="mt-2 font-display text-[15px] font-extrabold">{som(o.total)}</div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mb-3 rounded-[14px] border border-lime bg-surface-2 p-3">
              <div className="text-[12px] text-muted">Выбран заказ #{selected.id.slice(-8)}</div>
              <div className="mt-3 space-y-2">
                {selected.items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-[10px] border border-line p-2.5">
                      <button type="button" aria-label={`Выбрать ${item.sku}`} onClick={() => setItemQty(item.id, qty > 0 ? 0 : item.qty, item.qty)} className={`h-5 w-5 flex-none rounded border ${qty > 0 ? 'border-lime bg-lime text-lime-ink' : 'border-faint'}`}>
                        {qty > 0 ? '✓' : ''}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{item.sku}</div>
                        <div className="text-[11px] text-subtle">{som(item.price)} · куплено {item.qty}</div>
                      </div>
                      <div className="flex h-8 items-center overflow-hidden rounded-[8px] border border-line">
                        <button type="button" aria-label={`Уменьшить ${item.sku}`} onClick={() => setItemQty(item.id, qty - 1, item.qty)} className="h-full w-8 text-muted">−</button>
                        <span className="w-7 text-center font-mono text-xs">{qty}</span>
                        <button type="button" aria-label={`Увеличить ${item.sku}`} onClick={() => setItemQty(item.id, qty + 1, item.qty)} className="h-full w-8 text-muted">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-2 text-[13px] text-muted">Причина возврата</div>
          {reasons.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={`mb-2 flex w-full items-center gap-2.5 rounded-[11px] border bg-surface-2 p-3 text-left ${reason === r ? 'border-lime' : 'border-surface-3'}`}>
              <span className={`h-[18px] w-[18px] rounded-full border-2 ${reason === r ? 'border-lime bg-lime' : 'border-line'}`} />
              <span className="text-[13px] text-bright">{r}</span>
            </button>
          ))}
          <textarea value={photoNote} onChange={(e) => setPhotoNote(e.target.value)} placeholder="Комментарий, IMEI или детали проблемы" className="mt-1 min-h-[86px] w-full rounded-[12px] border border-line bg-surface-2 p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
          <div className="mt-2">
            <EvidencePicker files={files} onChange={setFiles} label="Фото товара/чека" hint="Фото дефекта, комплекта, упаковки или чека" />
          </div>
          {error && <p className="mt-2 text-sm text-danger-soft">{error}</p>}
          <button type="button" disabled={busy || !reason || !orderId || !Object.values(quantities).some((qty) => qty > 0)} onClick={submit} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-line disabled:text-faint">{busy ? 'Отправляем…' : 'Отправить заявку'}</button>
        </>
      )}
    </MobileAppFrame>
  );
}

function Step({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className={`flex gap-2 py-1 text-[12px] ${active ? 'text-muted' : 'text-faint'}`}>
      <span className={active ? 'text-lime' : ''}>{active ? '●' : '○'}</span>
      {label}
    </div>
  );
}
