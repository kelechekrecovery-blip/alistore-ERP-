'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchCatalog,
  fetchOrder,
  fetchOrderCancellationPreview,
  requestOrderCancellation,
  type CatalogProduct,
  type OrderCancellationPreview,
  type OrderDetail,
} from '@/lib/api';
import { TO_ORDER_CART_QTY_CAP, useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { WarrantyRequest } from '@/components/WarrantyRequest';
import { som } from '@/lib/format';
import { AccountDetailFrame } from '@/components/AccountDetailFrame';

const TIMELINE = ['Оформлен', 'Собран', 'Оплачен', 'Сборка', 'Доставка', 'Завершён'];
const STAGE: Record<string, number> = {
  draft: 0, created: 0, awaiting_confirmation: 0, confirmed: 1, reserved: 1, awaiting_payment: 1,
  paid: 2, picking: 3, packed: 3, ready_for_pickup: 4, courier_assigned: 4, out_for_delivery: 4, delivered: 4, completed: 5,
};
const BAD = new Set(['cancelled', 'returned', 'refunded']);
const LINE_STATUS: Record<string, string> = {
  pending_payment: 'Ожидает оплаты',
  reserved: 'Зарезервирован',
  awaiting_deposit: 'Ожидает задатка',
  procurement_draft: 'Закупка подготовлена',
  supplier_ordered: 'Заказан поставщику',
  in_transit: 'В пути',
  received: 'Поступил',
  quality_check: 'Проверка качества',
  ready: 'Готов к выдаче',
  handed_over: 'Выдан',
  late: 'Поставка задерживается',
  supplier_rejected: 'Поставщик отказал',
  customer_cancelled: 'Отменён покупателем',
  quarantined: 'На проверке',
  cancelled: 'Отменён',
};

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { add } = useCart();
  const { user, hydrated, authed } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null | 'missing'>(null);
  const [cancellation, setCancellation] = useState<OrderCancellationPreview | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const [cancellationResult, setCancellationResult] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      setOrder('missing');
      return;
    }
    authed((token) => fetchOrder(params.id, token))
      .then((o) => setOrder(o ?? 'missing'))
      .catch(() => setOrder('missing'));
    authed((token) => fetchOrderCancellationPreview(params.id, token))
      .then(setCancellation)
      .catch(() => setCancellation(null));
    fetchCatalog({ limit: 100 }).then((c) => setCatalog(c.items));
  }, [authed, hydrated, params.id, user]);
  const bySku = useMemo(() => new Map(catalog.map((p) => [p.sku, p])), [catalog]);

  const frame = (children: React.ReactNode) => (
    <AccountDetailFrame>{children}</AccountDetailFrame>
  );

  if (order === null) return frame(<div className="grid flex-1 place-items-center font-mono text-sm text-subtle">Загрузка…</div>);
  if (order === 'missing') return frame(<div className="grid flex-1 place-items-center text-center"><div><p className="font-display text-lg font-bold">Заказ не найден</p><Link href="/account" className="mt-3 inline-block text-sm text-lime">← В кабинет</Link></div></div>);

  const stageIdx = STAGE[order.status] ?? 0;
  const bad = BAD.has(order.status);

  function reorder() {
    if (order === null || order === 'missing') return;
    let any = false;
    for (const i of order.items) {
      const p = bySku.get(i.sku);
      if (!p) continue;
      const toOrder = p.supplyMode === 'to_order';
      add({
        id: p.id, sku: p.sku, name: p.name, price: i.price,
        stockLimit: toOrder ? TO_ORDER_CART_QTY_CAP : p.availableUnits,
        supplyMode: toOrder ? 'to_order' : 'own_stock',
        supplyLeadDays: toOrder ? p.supplyLeadDays : null,
      }, i.qty);
      any = true;
    }
    if (any) router.push('/cart');
  }

  async function requestCancellation() {
    const reason = cancellationReason.trim();
    if (reason.length < 3 || cancellationBusy || order === null || order === 'missing') return;
    const orderId = order.id;
    setCancellationBusy(true);
    setCancellationError(null);
    try {
      const result = await authed((token) => requestOrderCancellation(
        orderId,
        reason,
        token,
        crypto.randomUUID(),
      ));
      setCancellationResult(
        result.status === 'awaiting_owner'
          ? 'Запрос принят. Решение проверит владелец.'
          : result.status === 'refund_queued'
            ? `Заказ отменён. Возврат ${som(result.approvedRefundAmount ?? result.requestedRefundAmount)} поставлен в очередь.`
            : 'Запрос на отмену принят.',
      );
      const refreshed = await authed((token) => fetchOrder(orderId, token));
      if (refreshed) setOrder(refreshed);
    } catch (error) {
      setCancellationError(error instanceof Error ? error.message : 'Не удалось отправить запрос');
    } finally {
      setCancellationBusy(false);
    }
  }

  return frame(
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
      <div className="mb-1 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Заказ #{order.id.slice(-8)}</span>
      </div>
      <div className="mb-3 ml-8 text-[13px] text-muted">{order.channel} · {order.fulfillmentType ?? 'pickup'} · {som(order.total)}</div>

      {!bad && (
        <Link href={`/account/orders/${order.id}/status`} className="mb-4 flex items-center justify-between rounded-[13px] bg-lime px-4 py-3 text-[13px] font-bold text-lime-ink">
          <span>📍 Отследить заказ</span>
          <span>→</span>
        </Link>
      )}

      {bad ? (
        <div className="mb-4 rounded-[14px] border border-danger-soft/30 bg-danger-soft/5 p-4 text-sm font-semibold text-danger-soft">
          Заказ {order.status === 'cancelled' ? 'отменён' : order.status === 'refunded' ? 'возвращён (деньги)' : 'возвращён'}
        </div>
      ) : (
        <div className="mb-4 rounded-[16px] border border-surface-3 bg-surface-2 p-4">
          {TIMELINE.map((t, i) => {
            const reached = i <= stageIdx; const current = i === stageIdx;
            return (
              <div key={t} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full text-[13px] ${current ? 'bg-coral text-white' : reached ? 'bg-lime text-lime-ink' : 'bg-surface-3 text-subtle'}`}>{reached && !current ? '✓' : i + 1}</span>
                  {i < TIMELINE.length - 1 && <span className={`min-h-[14px] w-0.5 flex-1 ${i < stageIdx ? 'bg-lime' : 'bg-surface-3'}`} />}
                </div>
                <div className="pb-4"><div className={`text-sm font-semibold ${reached ? 'text-white' : 'text-subtle'}`}>{t}</div></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-subtle">Получение</div>
        <div className="flex justify-between gap-3 py-1 text-[13px]">
          <span className="text-muted">Тип</span>
          <span className="text-right text-bright">{order.fulfillmentType ?? 'pickup'}</span>
        </div>
        {order.pickupPoint && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-muted">Точка</span>
            <span className="text-right text-bright">{order.pickupPoint}</span>
          </div>
        )}
        {order.deliveryAddress && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-muted">Адрес</span>
            <span className="text-right text-bright">{order.deliveryAddress}</span>
          </div>
        )}
        {order.deliverySlot && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-muted">Слот</span>
            <span className="text-right text-bright">{order.deliverySlot}</span>
          </div>
        )}
        {order.pickupCode && (
          <div className="mt-2 rounded-[11px] bg-lime/10 px-3 py-2">
            <div className="text-[11px] text-muted">Код выдачи</div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-lime">{order.pickupCode}</div>
          </div>
        )}
      </div>

      <div className="mb-2 font-display text-base font-bold">Состав</div>
      {order.items.map((i, idx) => (
        <div key={idx} className="mb-2 flex items-center gap-3 rounded-[14px] border border-surface-3 bg-surface-2 p-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-surface-3 to-ink-dark font-display font-extrabold text-white/15">{(bySku.get(i.sku)?.name ?? i.sku).slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{bySku.get(i.sku)?.name ?? i.sku}</div>
            {i.fulfillmentStatus && (
              <div className="mt-1 text-[11px] text-lime">
                {LINE_STATUS[i.fulfillmentStatus] ?? i.fulfillmentStatus}
                {i.promisedDate ? ` · обещанная дата ${new Date(i.promisedDate).toLocaleDateString('ru-RU')}` : ''}
              </div>
            )}
            {i.orderLineSupply && i.orderLineSupply.orderedQty > 1 && (
              <div className="mt-0.5 text-[11px] text-subtle">
                Принято {i.orderLineSupply.receivedQty} из {i.orderLineSupply.orderedQty}
              </div>
            )}
            {i.imei && <div className="font-mono text-[11px] text-subtle">IMEI {i.imei}</div>}
            {i.imei && user && <div className="mt-1"><WarrantyRequest imei={i.imei} customerId={user.customerId} /></div>}
          </div>
          <span className="text-[13px] text-subtle">× {i.qty}</span>
          <span className="font-mono text-[13px] font-semibold">{som(i.price * i.qty)}</span>
        </div>
      ))}

      {order.payments.length > 0 && (
        <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-subtle">Оплата</div>
          {order.payments.map((p, idx) => (
            <div key={idx} className="flex justify-between py-1 text-[13px]"><span className="text-muted">{p.method}</span><span className="font-mono">{som(p.amount)}</span></div>
          ))}
        </div>
      )}
      {(order.receivables?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-subtle">График начислений</div>
          {order.receivables?.map((row) => (
            <div key={row.id} className="flex justify-between gap-3 py-1 text-[13px]">
              <span className="text-muted">
                {row.kind === 'supply_deposit' ? 'Задаток'
                  : row.kind === 'stock_sale' ? 'Складской товар'
                    : row.kind === 'supply_balance' ? 'Остаток заказного товара'
                      : 'Доставка'}
              </span>
              <span className="text-right font-mono">
                {som(row.settledAmount)} / {som(row.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {cancellation?.canCancel && (
        <div className="mt-3 rounded-[14px] border border-coral/30 bg-coral/5 p-4">
          <div className="text-xs uppercase tracking-wide text-coral">Предварительный расчёт отмены</div>
          <div className="mt-2 flex justify-between gap-3 text-[13px]">
            <span className="text-muted">Ожидаемый возврат</span>
            <span className="font-mono font-semibold text-bright">{som(cancellation.estimatedRefundAmount)}</span>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-muted">{cancellation.note}</p>
          {cancellation.ownerReviewRequired && (
            <p className="mt-1 text-[11px] text-coral">PO уже отправлен: решение и подтверждающие документы проверит владелец.</p>
          )}
          {cancellationResult ? (
            <p className="mt-3 rounded-[11px] border border-lime/30 bg-lime/5 px-3 py-2 text-[12px] text-lime">
              {cancellationResult}
            </p>
          ) : cancellation.requestEnabled ? (
            <div className="mt-3">
              <label className="block text-[11px] text-muted" htmlFor="cancellation-reason">
                Причина отмены
              </label>
              <textarea
                id="cancellation-reason"
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                minLength={3}
                maxLength={500}
                rows={3}
                className="mt-1 w-full resize-none rounded-[11px] border border-surface-3 bg-ink-dark px-3 py-2 text-[12px] text-bright outline-none focus:border-coral"
                placeholder="Например: передумал покупать товар"
              />
              {cancellationError && <p className="mt-1 text-[11px] text-danger-soft">{cancellationError}</p>}
              <button
                type="button"
                disabled={cancellationBusy || cancellationReason.trim().length < 3}
                onClick={() => void requestCancellation()}
                className="mt-2 w-full rounded-[11px] border border-coral/30 px-3 py-2 text-[12px] font-semibold text-coral disabled:opacity-40"
              >
                {cancellationBusy ? 'Отправляем…' : 'Подтвердить запрос на отмену'}
              </button>
            </div>
          ) : (
            <Link href="/support" className="mt-3 block rounded-[11px] border border-coral/30 px-3 py-2 text-center text-[12px] font-semibold text-coral">
              Запросить отмену через поддержку
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={reorder} className="rounded-[13px] border border-surface-3 bg-surface-2 py-3.5 text-center text-[13px] font-semibold text-lime">🔁 Повторить</button>
        <Link href="/account/returns" className="rounded-[13px] border border-surface-3 bg-surface-2 py-3.5 text-center text-[13px] font-semibold text-bright">↩ Возврат</Link>
      </div>
      <Link href="/support" className="mt-2 block rounded-[13px] border border-surface-3 bg-surface-2 py-3.5 text-center text-[13px] font-semibold text-bright">💬 Написать в поддержку</Link>
    </div>,
  );
}
