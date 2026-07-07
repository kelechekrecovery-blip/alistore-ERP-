'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  checkPaymentTerminal,
  clearSyncedOfflinePosQueue,
  createLocalReceiptNo,
  createPosClientSaleId,
  createScannerKeyHandler,
  enqueueOfflinePosSale,
  fetchCatalog,
  findProductByScan,
  isLikelyNetworkError,
  loadOfflinePosQueue,
  offlineQueueStats,
  posSale,
  printPosReceipt,
  syncOfflinePosQueue,
  type CatalogProduct,
  type OfflinePosPayload,
  type OfflinePosQueueItem,
  type PosPendingApproval,
  type PosReceiptSnapshot,
  type PosSaleResult,
} from '@/lib/api';
import { som } from '@/lib/format';
import { PosCheckout } from '@/components/pos/PosCheckout';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

const POINT = 'BISHKEK-1';
const SHOP = 'AliStore Центр';
const DISCOUNTS = [0, 5, 10, 15];

export default function PosPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cat, setCat] = useState('all');
  const [ticket, setTicket] = useState<Record<string, number>>({});
  const [discIdx, setDiscIdx] = useState(0);
  const [route, setRoute] = useState<'sell' | 'pay' | 'pending' | 'done'>('sell');
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<PosSaleResult | null>(null);
  const [pending, setPending] = useState<PosPendingApproval | null>(null);
  const [offlineResult, setOfflineResult] = useState<OfflinePosQueueItem | null>(null);
  const [receiptSnapshot, setReceiptSnapshot] = useState<PosReceiptSnapshot | null>(null);
  const [activeClientSaleId, setActiveClientSaleId] = useState('');
  const [queue, setQueue] = useState<OfflinePosQueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [terminalMessage, setTerminalMessage] = useState('Терминал готов к проверке');
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items));
  }, []);

  useEffect(() => {
    setQueue(loadOfflinePosQueue());
    const refreshOnline = () => setOnline(window.navigator.onLine);
    refreshOnline();
    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
    return () => {
      window.removeEventListener('online', refreshOnline);
      window.removeEventListener('offline', refreshOnline);
    };
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );
  const grid = products.filter((p) => cat === 'all' || p.category === cat);

  const lines = Object.entries(ticket).map(([id, qty]) => ({ product: byId.get(id)!, qty }));
  const subtotal = lines.reduce((s, l) => s + (l.product?.price ?? 0) * l.qty, 0);
  const discPct = DISCOUNTS[discIdx];
  const total = Math.round(subtotal * (1 - discPct / 100));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const queueSummary = offlineQueueStats(queue);
  const cashier = session?.username || session?.role || 'staff';

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1600);
  }

  function add(p: CatalogProduct) {
    setTicket((t) => {
      const cur = t[p.id] ?? 0;
      if (p.availableUnits > 0 && cur >= p.availableUnits) {
        flash('Больше нет в наличии');
        return t;
      }
      return { ...t, [p.id]: cur + 1 };
    });
  }
  function setQty(id: string, qty: number) {
    setTicket((t) => {
      if (qty <= 0) {
        const { [id]: _, ...rest } = t;
        return rest;
      }
      const p = byId.get(id);
      const capped = p && p.availableUnits > 0 ? Math.min(qty, p.availableUnits) : qty;
      return { ...t, [id]: capped };
    });
  }

  function scanProduct(raw: string) {
    const match = findProductByScan(products, raw);
    setScanCode(match.code);
    if (match.ok) {
      add(match.product);
      flash(`Скан: ${match.product.sku}`);
      setScanCode('');
    } else {
      flash(match.reason);
    }
  }

  useEffect(() => {
    const handler = createScannerKeyHandler(scanProduct);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [products]);

  function buildPayload(clientSaleId: string): OfflinePosPayload {
    return {
      staffId: session?.staffId ?? '',
      point: POINT,
      method: method ?? 'cash',
      discountPct: discPct,
      approvalId: pending?.approvalId,
      clientSaleId,
      lines: lines.map((l) => ({
        productId: l.product.id,
        sku: l.product.sku,
        price: l.product.price,
        qty: l.qty,
      })),
    };
  }

  function buildSnapshot(clientSaleId: string): PosReceiptSnapshot {
    return {
      clientSaleId,
      localReceiptNo: createLocalReceiptNo(clientSaleId),
      cashier,
      shop: SHOP,
      point: POINT,
      method: method ?? 'cash',
      subtotal,
      total,
      discountPct: discPct,
      createdAt: new Date().toISOString(),
      lines: lines.map((l) => ({
        productId: l.product.id,
        sku: l.product.sku,
        name: l.product.name,
        price: l.product.price,
        qty: l.qty,
      })),
    };
  }

  async function finish() {
    if (!method || !session) return;
    const clientSaleId = activeClientSaleId || createPosClientSaleId();
    setActiveClientSaleId(clientSaleId);
    const payload = buildPayload(clientSaleId);
    const snapshot = buildSnapshot(clientSaleId);
    setBusy(true);
    try {
      const terminal = await checkPaymentTerminal(method, online);
      setTerminalMessage(terminal.message);
      if (!terminal.ok) throw new Error(terminal.message);

      const res = await posSale(payload, session.accessToken);
      if (res.pendingApproval) {
        setPending(res);
        setRoute('pending');
      } else {
        setResult(res);
        setReceiptSnapshot(snapshot);
        setOfflineResult(null);
        setPending(null);
        setRoute('done');
      }
    } catch (e) {
      if (isLikelyNetworkError(e, online)) {
        const queued = enqueueOfflinePosSale(payload, snapshot);
        setQueue(loadOfflinePosQueue());
        setReceiptSnapshot(queued.snapshot);
        setOfflineResult(queued);
        setResult(null);
        setPending(null);
        setRoute('done');
        flash('Сохранено в offline очередь');
      } else {
        flash(e instanceof Error ? e.message : 'Ошибка продажи');
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncQueue() {
    if (!session) {
      flash('Войдите сотрудником');
      return;
    }
    setSyncing(true);
    try {
      const next = await syncOfflinePosQueue(
        (payload) => posSale({ ...payload, staffId: session.staffId }, session.accessToken),
        setQueue,
      );
      setQueue(next);
      const stats = offlineQueueStats(next);
      if (stats.failed > 0) flash(`Конфликты синка: ${stats.failed}`);
      else if (stats.approval > 0) flash(`Нужно одобрение: ${stats.approval}`);
      else flash('Очередь синхронизирована');
      fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }

  function newSale() {
    setTicket({});
    setDiscIdx(0);
    setMethod(null);
    setResult(null);
    setPending(null);
    setOfflineResult(null);
    setReceiptSnapshot(null);
    setActiveClientSaleId('');
    setRoute('sell');
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items)); // refresh stock
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4 font-sans">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Выйти
        </Link>
        <StaffSessionLogin
          title="POS · вход"
          caption="Откройте кассу под своей staff-сессией."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4 font-sans text-white">
      <Link
        href="/"
        className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
      >
        ⌂ Выйти
      </Link>

      <div className="flex h-[820px] max-h-[95vh] w-full max-w-[1180px] overflow-hidden rounded-[24px] border-8 border-[#201B17] bg-[#16130F] shadow-2xl">
        {/* LEFT: catalog */}
        <div className="flex flex-1 flex-col border-r border-[#2E2822]">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#2E2822] px-5 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display text-lg font-extrabold text-white">
              A
            </span>
            <div>
              <div className="font-display text-base font-bold text-white">POS · Касса</div>
              <div className="text-xs text-[#8A7F76]">
                Смена · {cashier} · {SHOP}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                clearStaffSession();
                setSession(null);
              }}
              className="rounded-chip border border-[#2E2822] px-3 py-1.5 text-xs font-semibold text-[#D8CFC6] hover:border-[#3A342E]"
            >
              Выйти staff
            </button>
            <span className={`ml-auto rounded-chip px-3 py-1.5 text-xs ${online ? 'bg-lime/10 text-lime' : 'bg-warn/15 text-warn'}`}>
              {online ? '● онлайн' : '○ offline'} · {queueSummary.pending} в очереди
            </span>
          </div>

          <div className="flex flex-shrink-0 flex-col gap-2 border-b border-[#2E2822] px-5 py-3">
            <div className="flex gap-2">
              <input
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') scanProduct(scanCode);
                }}
                placeholder="SKU / штрихкод / IMEI"
                className="min-w-0 flex-1 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime"
              />
              <button type="button" onClick={() => scanProduct(scanCode)} className="rounded-[10px] bg-lime px-4 py-2 text-sm font-bold text-lime-ink">
                Скан
              </button>
              <button
                type="button"
                disabled={syncing || queueSummary.pending === 0}
                onClick={syncQueue}
                className="rounded-[10px] border border-[#2E2822] bg-[#221E19] px-4 py-2 text-sm font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
              >
                {syncing ? 'Синк…' : `Синк ${queueSummary.pending}`}
              </button>
              <button
                type="button"
                disabled={!receiptSnapshot}
                onClick={() => receiptSnapshot && printPosReceipt(receiptSnapshot, result)}
                className="rounded-[10px] border border-[#2E2822] bg-[#221E19] px-4 py-2 text-sm font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
              >
                Печать
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8A7F76]">
              <span>Сканер: keyboard-wedge</span>
              <span>Принтер: browser/thermal print</span>
              <span>{terminalMessage}</span>
              {queueSummary.synced > 0 && (
                <button
                  type="button"
                  onClick={() => setQueue(clearSyncedOfflinePosQueue())}
                  className="text-lime hover:text-white"
                >
                  очистить synced ({queueSummary.synced})
                </button>
              )}
            </div>
            {queue.length > 0 && (
              <div className="max-h-[78px] overflow-y-auto rounded-[10px] border border-[#2E2822] bg-[#120F0C]">
                {queue.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 border-b border-[#221E19] px-3 py-2 text-xs last:border-0">
                    <span className={`h-2 w-2 rounded-full ${item.status === 'synced' ? 'bg-lime' : item.status === 'failed' ? 'bg-danger' : item.status === 'approval_required' ? 'bg-warn' : 'bg-[#8A7F76]'}`} />
                    <span className="font-mono text-[#D8CFC6]">{item.localReceiptNo}</span>
                    <span className="text-[#8A7F76]">{queueStatus(item.status)}</span>
                    <span className="ml-auto text-[#A79C92]">{som(item.snapshot.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 gap-2 overflow-x-auto px-5 pb-2 pt-4">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`flex-shrink-0 whitespace-nowrap rounded-chip border px-4 py-2 text-sm font-semibold transition ${
                  cat === c
                    ? 'border-lime bg-lime text-lime-ink'
                    : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6] hover:border-[#3A342E]'
                }`}
              >
                {c === 'all' ? 'Все' : c}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2">
            <div className="grid grid-cols-3 gap-3">
              {grid.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3 text-left transition hover:border-lime/40"
                >
                  <div className="relative mb-2.5 grid h-20 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                    <span className="font-display text-3xl font-extrabold text-white/15">
                      {p.name.slice(0, 1)}
                    </span>
                    {p.availableUnits < 5 && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-warn px-1.5 py-0.5 text-[9px] font-bold text-lime-ink">
                        {p.availableUnits} шт
                      </span>
                    )}
                  </div>
                  <div className="min-h-[34px] text-[13px] font-semibold leading-tight text-white">
                    {p.name}
                  </div>
                  <div className="mt-1 font-display text-[15px] font-extrabold text-lime tabular">
                    {som(p.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: receipt */}
        <div className="flex w-[420px] flex-shrink-0 flex-col bg-[#1A1611]">
          <div className="flex flex-shrink-0 items-center border-b border-[#2E2822] px-5 py-4">
            <span className="font-display text-[17px] font-bold text-white">Чек</span>
            <span className="ml-2 text-sm text-[#8A7F76]">{count} поз.</span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => setTicket({})}
                className="ml-auto text-sm text-[#FF8A7A] hover:text-danger"
              >
                Очистить
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {lines.length === 0 ? (
              <div className="py-16 text-center text-[#6E645C]">
                <div className="text-5xl">🧾</div>
                <div className="mt-3 text-sm">Добавьте товары тапом</div>
              </div>
            ) : (
              lines.map((l) => (
                <div key={l.product.id} className="flex gap-3 border-b border-[#221E19] py-3">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[9px] bg-[#2A2620] font-display font-extrabold text-white/20">
                    {l.product.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white">{l.product.name}</div>
                    <div className="mt-0.5 text-xs text-[#8A7F76]">{som(l.product.price)}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex items-center gap-3 rounded-[7px] bg-[#221E19] px-2 py-1">
                        <button type="button" onClick={() => setQty(l.product.id, l.qty - 1)} className="text-white">
                          −
                        </button>
                        <span className="font-mono text-[13px] text-white">{l.qty}</span>
                        <button type="button" onClick={() => setQty(l.product.id, l.qty + 1)} className="text-white">
                          +
                        </button>
                      </div>
                      <span className="ml-auto font-display text-sm font-bold text-white tabular">
                        {som(l.product.price * l.qty)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {count > 0 && (
            <div className="flex-shrink-0 border-t border-[#2E2822] px-5 py-4">
              <div className="mb-3 flex gap-2">
                {DISCOUNTS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDiscIdx(i)}
                    className={`flex-1 rounded-[9px] border py-2 text-center text-xs font-semibold transition ${
                      discIdx === i
                        ? 'border-lime bg-lime text-lime-ink'
                        : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
                    }`}
                  >
                    {d}%
                  </button>
                ))}
              </div>
              <div className="flex justify-between py-0.5 text-[13px] text-[#A79C92]">
                Подытог <span className="text-[#D8CFC6] tabular">{som(subtotal)}</span>
              </div>
              {discPct > 0 && (
                <div className="flex justify-between py-0.5 text-[13px] text-lime">
                  Скидка {discPct}% <span className="tabular">−{som(subtotal - total)}</span>
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-display text-[17px] font-bold text-white">Итого</span>
                <span className="font-display text-[22px] font-extrabold text-lime tabular">
                  {som(total)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMethod(null);
                  setActiveClientSaleId(createPosClientSaleId());
                  setRoute('pay');
                }}
                className="mt-3 w-full rounded-[12px] bg-lime py-3.5 text-center text-base font-bold text-lime-ink transition hover:brightness-95"
              >
                К оплате
              </button>
            </div>
          )}
        </div>

        {/* PAYMENT OVERLAY */}
        {route !== 'sell' && (
          <PosCheckout
            route={route}
            total={total}
            discountLimit={DISCOUNTS[2]}
            method={method}
            busy={busy}
            pending={pending}
            result={result}
            offlineResult={offlineResult}
            onSelectMethod={setMethod}
            onFinish={finish}
            onCancel={() => { setPending(null); setRoute('sell'); }}
            onNewSale={newSale}
            onPrintReceipt={() => receiptSnapshot && printPosReceipt(receiptSnapshot, result)}
          />
        )}

        {toast && (
          <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[12px] bg-lime px-6 py-3 text-sm font-semibold text-lime-ink">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function queueStatus(status: OfflinePosQueueItem['status']) {
  const labels: Record<OfflinePosQueueItem['status'], string> = {
    queued: 'в очереди',
    syncing: 'синхронизация',
    synced: 'проведено',
    failed: 'конфликт',
    approval_required: 'одобрение',
  };
  return labels[status];
}
