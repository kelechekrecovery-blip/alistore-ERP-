'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  buildReceiptData,
  checkPaymentTerminal,
  clearSyncedOfflinePosQueue,
  createLocalReceiptNo,
  createPosClientSaleId,
  createScannerKeyHandler,
  enqueueOfflinePosSale,
  findProductByScan,
  findPosCustomer,
  isLikelyNetworkError,
  loadOfflinePosQueue,
  offlineQueueStats,
  posSale,
  printPosReceipt,
  printServerSvg,
  renderServerReceipt,
  syncOfflinePosQueue,
  syncPosCatalogCache,
  type CatalogProduct,
  type OfflinePosPayload,
  type PosPayment,
  type PosCustomer,
  type OfflinePosQueueItem,
  type PosPendingApproval,
  type PosReceiptSnapshot,
  type PosSaleResult,
} from '@/lib/api';
import { PosCatalog } from '@/components/pos/PosCatalog';
import { PosCheckout } from '@/components/pos/PosCheckout';
import { PosTicket } from '@/components/pos/PosTicket';
import { ServicePosPayment } from '@/components/pos/ServicePosPayment';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  restoreStaffSession,
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
  const [catalogSync, setCatalogSync] = useState('Каталог готов к delta sync');
  const [session, setSession] = useState<StaffSession | null>(null);
  const [serviceWorkOrderId, setServiceWorkOrderId] = useState('');
  const [serverPrintBusy, setServerPrintBusy] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [customerBusy, setCustomerBusy] = useState(false);

  useEffect(() => {
    void restoreStaffSession().then(setSession);
    setServiceWorkOrderId(new URLSearchParams(window.location.search).get('serviceWorkOrderId') ?? '');
  }, []);

  useEffect(() => {
    void refreshCatalog();
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

  async function refreshCatalog() {
    const next = await syncPosCatalogCache({ limit: 100 });
    setProducts(next.catalog.items);
    const label =
      next.source === 'network_delta'
        ? `Каталог delta: +${next.changed} / -${next.removed}`
        : next.source === 'network_full'
          ? `Каталог full: ${next.catalog.items.length}`
          : next.source === 'cache'
            ? 'Каталог из offline cache'
            : 'Каталог недоступен';
    setCatalogSync(next.warning ? `${label} · ${next.warning}` : label);
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

  function buildPayload(clientSaleId: string, salePayments: PosPayment[]): OfflinePosPayload {
    return {
      staffId: session?.staffId ?? '',
      point: POINT,
      method: salePayments[0]?.method ?? method ?? 'cash',
      payments: salePayments.length > 1 ? salePayments : undefined,
      discountPct: discPct,
      approvalId: pending?.approvalId,
      customerBinding: customer?.binding,
      clientSaleId,
      lines: lines.map((l) => ({
        productId: l.product.id,
        sku: l.product.sku,
        price: l.product.price,
        qty: l.qty,
      })),
    };
  }

  function buildSnapshot(clientSaleId: string, salePayments: PosPayment[]): PosReceiptSnapshot {
    return {
      clientSaleId,
      localReceiptNo: createLocalReceiptNo(clientSaleId),
      cashier,
      shop: SHOP,
      point: POINT,
      method: salePayments.length > 1 ? 'split' : salePayments[0]?.method ?? method ?? 'cash',
      payments: salePayments.length > 1 ? salePayments : undefined,
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

  async function finish(checkoutPayments?: PosPayment[]) {
    if (!session) return;
    const salePayments = normalizeSalePayments(checkoutPayments);
    if (salePayments.length === 0) return;
    const clientSaleId = activeClientSaleId || createPosClientSaleId();
    setActiveClientSaleId(clientSaleId);
    setMethod(salePayments[0]?.method ?? null);
    const payload = buildPayload(clientSaleId, salePayments);
    const snapshot = buildSnapshot(clientSaleId, salePayments);
    setBusy(true);
    try {
      for (const payment of salePayments) {
        const terminal = await checkPaymentTerminal(payment.method, online);
        setTerminalMessage(terminal.message);
        if (!terminal.ok) throw new Error(terminal.message);
      }

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

  async function lookupCustomer() {
    if (!session) return;
    const query = customerQuery.trim();
    const clientSaleId = activeClientSaleId || createPosClientSaleId();
    setActiveClientSaleId(clientSaleId);
    setCustomerBusy(true);
    try {
      const found = await findPosCustomer(query, POINT, clientSaleId, session.accessToken);
      if (!found) {
        setCustomer(null);
        flash('Клиент не найден');
        return;
      }
      setCustomer(found);
      flash(`Клиент: ${found.name}`);
    } catch (error) {
      setCustomer(null);
      flash(error instanceof Error ? error.message : 'Ошибка поиска клиента');
    } finally {
      setCustomerBusy(false);
    }
  }

  function normalizeSalePayments(checkoutPayments?: PosPayment[]): PosPayment[] {
    if (checkoutPayments?.length) {
      return checkoutPayments
        .map((payment) => ({ method: payment.method, amount: Math.round(payment.amount) }))
        .filter((payment) => payment.method && payment.amount > 0);
    }
    return method ? [{ method, amount: total }] : [];
  }

  async function syncQueue() {
    if (!session) {
      flash('Войдите сотрудником');
      return;
    }
    setSyncing(true);
    try {
      const next = await syncOfflinePosQueue(
        (payload) => {
          if (payload.staffId !== session.staffId) {
            throw new Error('Offline продажа принадлежит другому кассиру');
          }
          return posSale(payload, session.accessToken);
        },
        setQueue,
      );
      setQueue(next);
      const stats = offlineQueueStats(next);
      if (stats.failed > 0) flash(`Конфликты синка: ${stats.failed}`);
      else if (stats.approval > 0) flash(`Нужно одобрение: ${stats.approval}`);
      else flash('Очередь синхронизирована');
      await refreshCatalog();
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
    setCustomer(null);
    setCustomerQuery('');
    setRoute('sell');
    void refreshCatalog();
  }

  async function printServerReceipt() {
    if (!session || !receiptSnapshot) return;
    setServerPrintBusy(true);
    try {
      const rendered = await renderServerReceipt(buildReceiptData(receiptSnapshot, result), session.accessToken);
      printServerSvg(rendered.svg, result?.receiptNo ?? receiptSnapshot.localReceiptNo);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка серверной печати');
    } finally {
      setServerPrintBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="erp3-stage fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
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

  if (serviceWorkOrderId) {
    return <ServicePosPayment workOrderId={serviceWorkOrderId} session={session} onBack={() => {
      window.history.replaceState({}, '', '/pos');
      setServiceWorkOrderId('');
    }} />;
  }

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex items-center justify-center p-4 font-sans text-white">
      <Link
        href="/"
        className="fixed right-4 top-4 z-[60] rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
      >
        ⌂ Выйти
      </Link>

      <main
        data-testid="pos-terminal"
        className="erp3-shell relative flex h-[820px] max-h-[95vh] w-full max-w-[1180px] overflow-hidden border-[10px] border-ink bg-ink-dark"
      >
        <PosCatalog
          cashier={cashier}
          shop={SHOP}
          online={online}
          queueSummary={queueSummary}
          scanCode={scanCode}
          onScanCodeChange={setScanCode}
          onScan={scanProduct}
          syncing={syncing}
          onSync={syncQueue}
          canPrint={!!receiptSnapshot}
          onPrint={() => receiptSnapshot && printPosReceipt(receiptSnapshot, result)}
          catalogSync={catalogSync}
          terminalMessage={terminalMessage}
          queue={queue}
          onClearSynced={() => setQueue(clearSyncedOfflinePosQueue())}
          categories={categories}
          cat={cat}
          onSelectCategory={setCat}
          grid={grid}
          onAdd={add}
          onLogoutStaff={() => {
            clearStaffSession();
            setSession(null);
          }}
        />

        <PosTicket
          lines={lines}
          count={count}
          subtotal={subtotal}
          total={total}
          discPct={discPct}
          discIdx={discIdx}
          discounts={DISCOUNTS}
          onClear={() => setTicket({})}
          onSetQty={setQty}
          onSetDiscount={setDiscIdx}
          onCheckout={() => {
            setMethod(null);
            setActiveClientSaleId((current) => current || createPosClientSaleId());
            setRoute('pay');
          }}
          customerQuery={customerQuery}
          customer={customer}
          customerBusy={customerBusy}
          onCustomerQueryChange={setCustomerQuery}
          onFindCustomer={lookupCustomer}
          onClearCustomer={() => {
            setCustomer(null);
            setCustomerQuery('');
          }}
        />

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
            onPrintServerReceipt={receiptSnapshot ? printServerReceipt : undefined}
            serverPrintBusy={serverPrintBusy}
          />
        )}

        {toast && (
          <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[12px] bg-lime px-6 py-3 text-sm font-semibold text-lime-ink">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
