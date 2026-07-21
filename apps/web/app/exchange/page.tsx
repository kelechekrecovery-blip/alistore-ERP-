'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  exchangeDevice,
  fetchCatalog,
  isCatalogUnavailable,
  fetchUnit,
  type CatalogProduct,
  type ExchangeResult,
  type UnitLookup,
  uploadEvidenceImage,
} from '@/lib/api';
import { som } from '@/lib/format';
import { LoadFailure } from '@/components/LoadFailure';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, restoreStaffSession, type StaffSession } from '@/lib/staff-session';

const METHODS = [
  { id: 'cash', name: 'Наличные' },
  { id: 'card', name: 'Карта' },
  { id: 'qr_mbank', name: 'MBank' },
];
export default function ExchangePage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [imei, setImei] = useState('');
  const [unit, setUnit] = useState<UnitLookup | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [newId, setNewId] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const exchangeKey = useRef(crypto.randomUUID());

  useEffect(() => {
    void restoreStaffSession().then(setSession);
    setHydrated(true);
    fetchCatalog({ limit: 100, stockOnly: true }).then((c) => { if (isCatalogUnavailable(c)) throw new Error('Каталог не ответил'); setProducts(c.items); setLoadError(''); }).catch((cause: unknown) => {
      // Пустой список в этом select читается как «менять не на что». Это не так:
      // сервер недоступен, и клиенту нужно сказать об этом, а не показать пустоту.
      setProducts([]);
      setLoadError(cause instanceof Error && cause.message ? cause.message : ' ');
    });
  }, [reloadToken]);

  const newProduct = products.find((p) => p.id === newId) ?? null;
  const surcharge = unit && newProduct ? newProduct.price - unit.price : 0;
  const canSubmit = !!unit && unit.status === 'sold' && !!unit.orderId && !!newProduct
    && surcharge >= 0 && !!evidenceFile && (surcharge === 0 || method === 'cash');

  async function lookup() {
    if (!imei.trim() || !session) return;
    setErr(''); setUnit(null); setBusy(true);
    try {
      setUnit(await fetchUnit(imei.trim(), session.accessToken));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'IMEI не найден');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!unit?.orderId || !newProduct || !session) return;
    setErr(''); setBusy(true);
    try {
      const r = await exchangeDevice({
        originalOrderId: unit.orderId,
        oldImei: unit.imei,
        newProductId: newProduct.id,
        method,
      }, session.accessToken, exchangeKey.current);
      await uploadEvidenceImage({
        file: evidenceFile!,
        entityType: 'exchange',
        entityId: r.exchangeRequestId,
        label: 'exchange_condition',
        accessToken: session.accessToken,
      });
      setResult(r);
      exchangeKey.current = crypto.randomUUID();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка обмена');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setImei(''); setUnit(null); setNewId(''); setResult(null); setEvidenceFile(null); setErr('');
  }

  function logout() {
    clearStaffSession();
    setSession(null);
    reset();
  }

  if (!hydrated) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-night font-mono text-sm text-subtle">Загрузка…</div>;
  }

  if (!session) {
    return (
      <div className="erp3-stage fixed inset-0 z-50 grid place-items-center bg-night p-5 font-sans">
        <StaffSessionLogin
          title="Обмен · вход"
          caption="Нужна роль кассира, продавца или администратора."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex flex-col bg-night font-sans text-white">
      <header className="flex items-center gap-4 border-b border-surface-3 bg-ink-dark px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display text-lg font-extrabold text-white">⇄</span>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Exchange 3.0</div>
          <div className="font-display text-lg font-bold">Обмен товара</div>
          <div className="text-xs text-subtle">Возврат старого + продажа нового + доплата</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-subtle sm:inline">{session.username} · {session.role}</span>
          <button type="button" onClick={logout} className="rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">Выйти</button>
          <Link href="/pos" className="rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">⌂ POS</Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[560px]">
          {result ? (
            <div className="rounded-[18px] border border-surface-3 bg-surface p-7 text-center">
              <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-warn/15 text-3xl font-bold text-warn">2FA</div>
              <div className="mt-4 font-display text-2xl font-extrabold">Отправлено на одобрение</div>
              <div className="mt-2 text-sm text-muted">
                {result.oldImei} → {result.newImei}
              </div>
              <div className="mt-1 text-sm text-muted">
                Доплата: <span className="font-mono text-warn">{som(result.surchargeAmount)}</span> · approval #{result.approvalId.slice(-6)}
              </div>
              <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-subtle">Фото сохранено в Evidence Vault. Деньги и склад не изменены: второй сотрудник должен подтвердить точный IMEI и суммы в Approval Inbox.</p>
              <Link href="/approvals" className="mt-5 inline-flex rounded-[11px] border border-warn/30 px-5 py-3 text-sm font-bold text-warn">Открыть Approval Inbox</Link>
              <button type="button" onClick={reset} className="mt-6 rounded-[11px] bg-lime px-6 py-3 font-bold text-lime-ink">Новый обмен</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* step 1: old device */}
              <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">1 · Возвращаемое устройство</div>
                <div className="flex gap-2">
                  <input
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup()}
                    placeholder="IMEI проданного устройства"
                    className="flex-1 rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-coral"
                  />
                  <button type="button" disabled={busy} onClick={lookup} className="rounded-[10px] bg-surface-2 px-4 py-2.5 text-sm font-semibold text-bright hover:bg-surface-3 disabled:opacity-40">Найти</button>
                </div>
                <label className="mt-3 block rounded-[10px] border border-dashed border-[#4A4139] bg-surface-2 p-3 text-sm text-bright">
                  <span className="block text-xs font-semibold uppercase text-subtle">Фото состояния до обмена</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                    className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:font-semibold file:text-white"
                  />
                </label>
                {unit && (
                  <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-surface-3 bg-surface-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{unit.product}</div>
                      <div className="font-mono text-[11px] text-subtle">{unit.imei} · {som(unit.price)}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${unit.status === 'sold' ? 'bg-lime/15 text-lime' : 'bg-warn/15 text-warn'}`}>
                      {unit.status === 'sold' ? 'продан' : unit.status}
                    </span>
                  </div>
                )}
                {unit && unit.status !== 'sold' && (
                  <div className="mt-2 text-xs text-danger-soft">Устройство не в статусе «продан» — обмен невозможен.</div>
                )}
              </div>

              {/* step 2: new device */}
              <div className={`rounded-[16px] border border-surface-3 bg-surface p-5 ${!unit ? 'opacity-40' : ''}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">2 · Новое устройство</div>
                {loadError !== '' ? (
                  <LoadFailure
                    what="список товаров"
                    detail={loadError.trim()}
                    onRetry={() => { setLoadError(''); setReloadToken((value) => value + 1); }}
                  />
                ) : (
                <select
                  value={newId}
                  disabled={!unit}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-coral"
                >
                  <option value="">— выберите товар —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {som(p.price)}</option>
                  ))}
                </select>
                )}
                {unit && newProduct && (
                  <div className="mt-3 flex items-center justify-between rounded-[12px] border border-surface-3 bg-surface-2 p-3 text-sm">
                    <span className="text-muted">Доплата</span>
                    <span className={`font-mono text-lg font-bold ${surcharge >= 0 ? 'text-lime' : 'text-danger-soft'}`}>{som(surcharge)}</span>
                  </div>
                )}
                {unit && newProduct && surcharge < 0 && (
                  <div className="mt-2 text-xs text-danger-soft">Новый товар дешевле — оформите возврат, а не обмен.</div>
                )}
              </div>

              {/* step 3: method + submit */}
              <div className={`rounded-[16px] border border-surface-3 bg-surface p-5 ${!canSubmit ? 'opacity-40' : ''}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">3 · Доплата — способ</div>
                <div className="flex gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!unit || !newProduct || (surcharge > 0 && m.id !== 'cash')}
                      onClick={() => setMethod(m.id)}
                      className={`flex-1 rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${
                        method === m.id ? 'border-lime bg-lime/10 text-lime' : 'border-surface-3 bg-surface-2 text-bright'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
                {surcharge > 0 && (
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Безналичная доплата будет доступна после подключения подтверждённого payment capture.
                  </p>
                )}
                <button
                  type="button"
                  disabled={!canSubmit || busy}
                  onClick={submit}
                  className="mt-4 w-full rounded-[12px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-line disabled:text-faint"
                >
                  {busy ? 'Отправляем…' : 'Запросить обмен'}
                </button>
              </div>

              {err && <div className="rounded-[12px] border border-danger-soft/30 bg-danger-soft/5 p-3 text-sm text-danger-soft">{err}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
