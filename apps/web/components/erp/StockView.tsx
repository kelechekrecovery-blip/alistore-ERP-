'use client';

import { Camera, Check, QrCode, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Card } from './Card';
import { som } from '@/lib/format';
import { fetchCatalog, printServerSvg, renderQrLabel, type CatalogProduct } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import { canPrintLabels } from '@/lib/staff-permissions';
import {
  diagnoseInventoryQuarantine,
  disposeInventoryQuarantine,
  fetchInventoryQuarantine,
  fetchInventoryValuationReconciliation,
  fetchInventoryValuationRollForward,
  uploadEvidenceImage,
  type InventoryQuarantineCase,
  type InventoryValuationReconciliation,
  type InventoryValuationRollForward,
  type QuarantineDiagnosis,
  type QuarantineDisposition,
} from '@/lib/api';
import type { Dashboard } from '@/lib/reports';

const LOW = 5;

const ORDER_STATUS: Record<string, string> = {
  created: 'Оформлен',
  reserved: 'Зарезервирован',
  paid: 'Оплачен',
  completed: 'Завершён',
  cancelled: 'Отменён',
  refunded: 'Возврат',
  exchanged: 'Обмен',
};

function stockChip(units: number): { label: string; color: string } {
  if (units <= 0) return { label: 'Нет', color: '#FF8A7A' };
  if (units < LOW) return { label: 'Мало', color: '#E5B23C' };
  return { label: 'В наличии', color: '#C6FF3D' };
}

/**
 * Warehouse view (ERP 2.0): stock stat cards + a per-product inventory table
 * (Товар/Остаток/Цена/Статус, low-stock first) built from the public catalog, plus the
 * orders-by-status breakdown from the dashboard.
 */
export function StockView({ d, accessToken, role, staffId }: { d: Dashboard | null; accessToken: string; role: string; staffId: string }) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [reconciliation, setReconciliation] = useState<InventoryValuationReconciliation | null>(null);
  const [reconciliationError, setReconciliationError] = useState('');
  const [rollForward, setRollForward] = useState<InventoryValuationRollForward | null>(null);
  const [rollForwardError, setRollForwardError] = useState('');
  const [period, setPeriod] = useState(() => defaultValuationPeriod());
  const [quarantine, setQuarantine] = useState<InventoryQuarantineCase[] | null>(null);
  const [quarantineError, setQuarantineError] = useState('');
  const [busyCase, setBusyCase] = useState('');
  const [diagnosis, setDiagnosis] = useState<Record<string, QuarantineDiagnosis>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, File | null>>({});
  const canReadFinance = role === 'admin' || role === 'owner';
  const canManageQuarantine = role === 'admin' || role === 'owner' || role === 'warehouse';
  const canPrintPriceTags = canPrintLabels(role);
  const [priceTagBusy, setPriceTagBusy] = useState('');
  const [priceTagError, setPriceTagError] = useState('');

  async function printPriceTag(product: CatalogProduct) {
    setPriceTagBusy(product.id);
    setPriceTagError('');
    try {
      const { svg } = await renderQrLabel(`${SITE_URL}/product/${product.id}`, accessToken);
      printServerSvg(svg, `Ценник ${product.name}`, `${product.name} · ${som(product.price)}`);
    } catch (error) {
      setPriceTagError(error instanceof Error ? error.message : 'Не удалось напечатать ценник');
    } finally {
      setPriceTagBusy('');
    }
  }

  const loadQuarantine = useCallback(() => {
    if (!canManageQuarantine) return;
    setQuarantineError('');
    fetchInventoryQuarantine(accessToken)
      .then(setQuarantine)
      .catch((error) => setQuarantineError(error instanceof Error ? error.message : 'Карантин недоступен'));
  }, [accessToken, canManageQuarantine]);

  useEffect(() => {
    fetchCatalog({ limit: 100 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!canReadFinance) return;
    fetchInventoryValuationReconciliation(accessToken)
      .then(setReconciliation)
      .catch((error) => setReconciliationError(error instanceof Error ? error.message : 'Сверка недоступна'));
  }, [accessToken, canReadFinance]);

  useEffect(() => {
    if (!canReadFinance) return;
    setRollForward(null);
    setRollForwardError('');
    fetchInventoryValuationRollForward(
      bishkekDayBoundary(period.from),
      bishkekDayBoundary(period.to),
      accessToken,
    )
      .then(setRollForward)
      .catch((error) => setRollForwardError(error instanceof Error ? error.message : 'Обороты недоступны'));
  }, [accessToken, canReadFinance, period]);

  useEffect(() => {
    loadQuarantine();
  }, [loadQuarantine]);

  async function diagnoseCase(item: InventoryQuarantineCase) {
    const file = evidence[item.id];
    if (!file) {
      setQuarantineError('Для диагноза приложите фото состояния устройства');
      return;
    }
    setBusyCase(item.id);
    setQuarantineError('');
    try {
      await uploadEvidenceImage({
        file,
        entityType: 'quarantine',
        entityId: item.id,
        label: 'quarantine_diagnosis',
        accessToken,
      });
      await diagnoseInventoryQuarantine(item.id, {
        diagnosis: diagnosis[item.id] ?? 'resellable',
        notes: notes[item.id]?.trim() || undefined,
      }, accessToken);
      loadQuarantine();
    } catch (error) {
      setQuarantineError(error instanceof Error ? error.message : 'Не удалось зафиксировать диагноз');
    } finally {
      setBusyCase('');
    }
  }

  async function disposeCase(item: InventoryQuarantineCase) {
    if (!item.diagnosis) return;
    setBusyCase(item.id);
    setQuarantineError('');
    try {
      const result = await disposeInventoryQuarantine(item.id, dispositionFor(item.diagnosis), accessToken);
      if ('approvalId' in result) {
        setQuarantine((current) => current?.map((row) => row.id === item.id
          ? { ...row, dispositionApprovalId: result.approvalId }
          : row) ?? current);
        setQuarantineError(`Запрос на списание ${result.approvalId} отправлен владельцу`);
      } else {
        loadQuarantine();
      }
    } catch (error) {
      setQuarantineError(error instanceof Error ? error.message : 'Не удалось применить решение');
    } finally {
      setBusyCase('');
    }
  }

  const items = [...(products ?? [])].sort((a, b) => a.availableUnits - b.availableUnits);
  const totalValue = items.reduce((sum, p) => sum + p.price * p.availableUnits, 0);
  const low = items.filter((p) => p.availableUnits > 0 && p.availableUnits < LOW).length;

  return (
    <div className="space-y-3.5">
      {/* stat cards */}
      <div className="grid grid-cols-3 gap-3.5">
        <Card>
          <div className="text-xs text-subtle">Позиций</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-white">
            {products === null ? '…' : items.length}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-subtle">На сумму</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-white">{som(totalValue)}</div>
        </Card>
        <Card>
          <div className="text-xs text-subtle">Мало остатка</div>
          <div
            className="mt-1.5 font-display text-2xl font-extrabold"
            style={{ color: low > 0 ? '#E5B23C' : '#C6FF3D' }}
          >
            {low}
          </div>
        </Card>
      </div>

      {/* inventory table */}
      <Card>
        <div className="mb-3 font-display text-[15px] font-bold text-white">Остатки по товарам</div>
        {priceTagError && (
          <div role="alert" className="mb-3 rounded-[7px] border border-danger-soft/30 bg-danger-soft/10 p-3 text-sm text-danger-soft">
            {priceTagError}
          </div>
        )}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b border-surface-3 pb-2 text-xs text-subtle">
          <span>Товар</span>
          <span className="text-right">Остаток</span>
          <span className="text-right">Цена</span>
          <span className="text-right">Статус</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {items.slice(0, 60).map((p) => {
            const chip = stockChip(p.availableUnits);
            return (
              <div
                key={p.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-b border-surface-2 py-2.5 text-[13px] last:border-0"
              >
                <span className="truncate pr-2 text-white">{p.name}</span>
                <span className="text-right font-mono" style={{ color: chip.color }}>
                  {p.availableUnits}
                </span>
                <span className="text-right font-mono text-bright">{som(p.price)}</span>
                <span className="flex items-center justify-end gap-2 text-right">
                  <span
                    className="rounded-chip px-2 py-0.5 text-[11px]"
                    style={{ background: `${chip.color}1a`, color: chip.color }}
                  >
                    {chip.label}
                  </span>
                  {canPrintPriceTags && (
                    <button
                      type="button"
                      title={`Печать ценника с QR: ${p.name}`}
                      aria-label={`Печать ценника: ${p.name}`}
                      disabled={priceTagBusy === p.id}
                      onClick={() => printPriceTag(p)}
                      className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-line text-muted hover:border-[#5A5148] hover:text-white disabled:opacity-50"
                    >
                      <QrCode size={14} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {products !== null && items.length === 0 && (
            <div className="py-8 text-center text-sm text-subtle">Каталог пуст</div>
          )}
        </div>
      </Card>

      {canManageQuarantine && (
        <Card>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
                <ShieldCheck size={17} className="text-warn" /> Карантин возвратных IMEI
              </div>
              <div className="mt-0.5 text-xs text-subtle">Фото и диагноз фиксирует один сотрудник, решение применяет другой</div>
            </div>
            <button
              type="button"
              title="Обновить карантин"
              aria-label="Обновить карантин"
              onClick={loadQuarantine}
              className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-line text-muted hover:border-[#5A5148] hover:text-white"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {quarantineError && (
            <div role="alert" className="mb-3 rounded-[7px] border border-danger-soft/30 bg-danger-soft/10 p-3 text-sm text-danger-soft">
              {quarantineError}
            </div>
          )}
          {quarantine === null && !quarantineError && (
            <div className="py-8 text-center text-sm text-subtle">Загружаем очередь карантина…</div>
          )}
          {quarantine?.length === 0 && (
            <div className="py-8 text-center text-sm text-subtle">Устройств на карантине нет</div>
          )}
          <div className="divide-y divide-surface-2">
            {quarantine?.map((item) => (
              <div key={item.id} data-testid={`quarantine-${item.id}`} className="grid gap-3 py-4 first:pt-1 lg:grid-cols-[1.25fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{item.unit.product.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
                    <span>{item.unit.imei}</span><span>{item.unit.location}</span><span>{som(item.unit.acquisitionCost ?? 0)}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#6F665E]">{item.sourceType === 'exchange' ? 'Обмен' : 'Возврат'} · {item.reason}</div>
                </div>

                {item.status === 'pending_diagnosis' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label={`Диагноз ${item.unit.imei}`}
                      value={diagnosis[item.id] ?? 'resellable'}
                      onChange={(event) => setDiagnosis((current) => ({ ...current, [item.id]: event.target.value as QuarantineDiagnosis }))}
                      className="h-9 rounded-[6px] border border-line bg-[#171411] px-2 text-xs text-white"
                    >
                      <option value="resellable">Можно вернуть в продажу</option>
                      <option value="repair">Нужен ремонт</option>
                      <option value="write_off">Списать</option>
                    </select>
                    <input
                      aria-label={`Комментарий ${item.unit.imei}`}
                      placeholder="Комментарий"
                      value={notes[item.id] ?? ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="h-9 min-w-0 rounded-[6px] border border-line bg-[#171411] px-2 text-xs text-white placeholder:text-[#6F665E]"
                    />
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[6px] border border-dashed border-[#4A423A] px-2 text-xs text-muted hover:border-[#6A6056] hover:text-white">
                      <Camera size={14} />
                      <span className="truncate">{evidence[item.id]?.name ?? 'Фото диагностики'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => setEvidence((current) => ({ ...current, [item.id]: event.target.files?.[0] ?? null }))}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyCase === item.id}
                      onClick={() => diagnoseCase(item)}
                      className="flex h-9 items-center justify-center gap-2 rounded-[6px] bg-warn px-3 text-xs font-semibold text-[#17120A] disabled:opacity-50"
                    >
                      <Check size={14} /> {busyCase === item.id ? 'Сохраняем…' : 'Зафиксировать'}
                    </button>
                  </div>
                )}

                {item.status === 'diagnosed' && (
                  <div className="text-xs">
                    <div className="font-semibold text-warn">{diagnosisLabel(item.diagnosis)}</div>
                    <div className="mt-1 text-subtle">Диагност: {item.diagnosedBy}</div>
                    {item.notes && <div className="mt-1 text-bright">{item.notes}</div>}
                  </div>
                )}

                {item.status === 'disposed' && (
                  <div className="text-xs">
                    <div className="font-semibold text-lime">Решение выполнено: {dispositionLabel(item.disposition)}</div>
                    <div className="mt-1 text-subtle">Исполнитель: {item.disposedBy}</div>
                  </div>
                )}

                <div className="flex justify-end">
                  {item.status === 'diagnosed' ? (
                    item.diagnosedBy === staffId ? (
                      <span className="rounded-chip bg-warn/10 px-2 py-1 text-[11px] text-warn">
                        Нужен второй сотрудник
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyCase === item.id || Boolean(item.dispositionApprovalId)}
                        onClick={() => disposeCase(item)}
                        className="flex h-9 items-center gap-2 rounded-[6px] bg-lime px-3 text-xs font-semibold text-[#101408] disabled:opacity-50"
                      >
                        <Wrench size={14} /> {item.dispositionApprovalId ? 'Ждёт владельца' : busyCase === item.id ? 'Применяем…' : dispositionAction(item.diagnosis)}
                      </button>
                    )
                  ) : (
                    <span className={`rounded-chip px-2 py-1 text-[11px] ${item.status === 'disposed' ? 'bg-lime/10 text-lime' : 'bg-warn/10 text-warn'}`}>
                      {item.status === 'disposed' ? 'Завершено' : 'Ждёт диагностики'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {canReadFinance && (
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-display text-[15px] font-bold text-white">Движение стоимости запасов</div>
              <div className="mt-0.5 text-xs text-subtle">Начало + поступления + возвраты ± перемещения и корректировки − выбытия = конец · время Бишкека</div>
            </div>
            {rollForward && (
              <span className={`rounded-chip px-2 py-1 text-[11px] ${rollForward.summary.consistent ? 'bg-lime/10 text-lime' : 'bg-danger-soft/10 text-danger-soft'}`}>
                {rollForward.summary.consistent ? 'Период сходится' : 'Есть расхождения'}
              </span>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11px] text-subtle">
                С
                <input
                  type="date"
                  value={period.from}
                  max={period.to}
                  onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
                  className="h-9 rounded-[6px] border border-line bg-[#171411] px-2 text-xs text-white"
                />
              </label>
              <label className="grid gap-1 text-[11px] text-subtle">
                До (не включая)
                <input
                  type="date"
                  value={period.to}
                  min={period.from}
                  onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
                  className="h-9 rounded-[6px] border border-line bg-[#171411] px-2 text-xs text-white"
                />
              </label>
            </div>
          </div>
          {rollForwardError && <div role="alert" className="rounded-[7px] border border-danger-soft/30 bg-danger-soft/10 p-3 text-sm text-danger-soft">{rollForwardError}</div>}
          {!rollForward && !rollForwardError && <div className="py-8 text-center text-sm text-subtle">Собираем исторические обороты…</div>}
          {rollForward && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <ValuationMetric label="Начало" value={som(rollForward.summary.openingValue)} />
                <ValuationMetric label="GL на начало" value={som(rollForward.summary.glOpening)} />
                <ValuationMetric label="Разница начала" value={som(rollForward.summary.openingDifference)} warning={rollForward.summary.openingDifference !== 0} />
                <ValuationMetric label="Конец" value={som(rollForward.summary.closingValue)} />
                <ValuationMetric label="GL на конец" value={som(rollForward.summary.glClosing)} />
                <ValuationMetric label="Разница конца" value={som(rollForward.summary.closingDifference)} warning={rollForward.summary.closingDifference !== 0} />
              </div>
              {!rollForward.summary.complete && (
                <div className="mt-3 rounded-[7px] border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
                  История неполна: возвраты без provenance {rollForward.summary.missingReversalQuantity}, перемещения {rollForward.summary.incompleteTransfers}, серийные поступления без стоимости {rollForward.summary.incompleteSerializedReceipts}, сервисные списания {rollForward.summary.incompleteServiceConsumptions}, quantity balances без полных слоёв {rollForward.summary.incompleteQuantityBalances}, склады выбытия {rollForward.summary.unknownIssueLocations}, склады возврата {rollForward.summary.unknownReversalLocations}, legacy consignment COGS {rollForward.summary.legacyConsignmentIssues}.
                </div>
              )}
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[1.7fr_0.9fr_repeat(7,0.75fr)] border-b border-surface-3 pb-2 text-[11px] text-subtle">
                    <span>Товар</span><span>Склад</span><span className="text-right">Начало</span><span className="text-right">Приход</span><span className="text-right">Возврат</span><span className="text-right">Вход перем.</span><span className="text-right">Продажи</span><span className="text-right">Выход перем.</span><span className="text-right">Конец</span>
                  </div>
                  {rollForward.rows.map((row) => (
                    <div key={`${row.productId}:${row.location}`} className="grid grid-cols-[1.7fr_0.9fr_repeat(7,0.75fr)] items-center border-b border-surface-2 py-2.5 text-xs last:border-0">
                      <span className="truncate pr-2 text-white">{row.name}<span className="ml-1 text-[#6F665E]">{row.sku}</span></span>
                      <span className="truncate text-muted">{row.location}</span>
                      <RollForwardAmount value={row.opening.value} quantity={row.opening.quantity} />
                      <RollForwardAmount value={row.receipts.value + row.adjustmentsIn.value} quantity={row.receipts.quantity + row.adjustmentsIn.quantity} />
                      <RollForwardAmount value={row.returns.value} quantity={row.returns.quantity} />
                      <RollForwardAmount value={row.transferIn.value} quantity={row.transferIn.quantity} />
                      <RollForwardAmount value={row.issues.value + row.adjustmentsOut.value} quantity={row.issues.quantity + row.adjustmentsOut.quantity} />
                      <RollForwardAmount value={row.transferOut.value} quantity={row.transferOut.quantity} />
                      <RollForwardAmount value={row.closing.value} quantity={row.closing.quantity} strong />
                    </div>
                  ))}
                  {rollForward.rows.length === 0 && <div className="py-6 text-center text-xs text-subtle">За период движений нет</div>}
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {canReadFinance && (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-display text-[15px] font-bold text-white">Оценка запасов и GL 1200</div>
              <div className="mt-0.5 text-xs text-subtle">Собственный товар по себестоимости, без комиссии</div>
            </div>
            {reconciliation && (
              <span className={`rounded-chip px-2 py-1 text-[11px] ${reconciliation.summary.consistent ? 'bg-lime/10 text-lime' : 'bg-danger-soft/10 text-danger-soft'}`}>
                {reconciliation.summary.consistent ? 'Сходится' : 'Есть расхождения'}
              </span>
            )}
          </div>
          {reconciliationError && (
            <div role="alert" className="rounded-[7px] border border-danger-soft/30 bg-danger-soft/10 p-3 text-sm text-danger-soft">
              {reconciliationError}
            </div>
          )}
          {!reconciliation && !reconciliationError && (
            <div className="py-8 text-center text-sm text-subtle">Сверяем FIFO-слои и проводки…</div>
          )}
          {reconciliation && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ValuationMetric label="Количественный" value={som(reconciliation.summary.quantityValue)} />
                <ValuationMetric label="Серийный" value={som(reconciliation.summary.serializedValue)} />
                <ValuationMetric label="GL 1200" value={som(reconciliation.summary.glInventoryBalance)} />
                <ValuationMetric
                  label="Разница"
                  value={som(reconciliation.summary.difference)}
                  warning={reconciliation.summary.difference !== 0}
                />
              </div>
              {!reconciliation.summary.complete && (
                <div className="mt-3 rounded-[7px] border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
                  Неполная оценка: у {reconciliation.summary.missingSerializedCostUnits} серийных единиц не указана себестоимость.
                </div>
              )}
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1.8fr_1fr_repeat(5,0.75fr)] border-b border-surface-3 pb-2 text-xs text-subtle">
                    <span>Товар</span><span>Склад</span><span className="text-right">Свои ед.</span><span className="text-right">FIFO ед.</span><span className="text-right">Δ ед.</span><span className="text-right">Баланс</span><span className="text-right">Δ сумма</span>
                  </div>
                  {reconciliation.quantity.map((row) => (
                    <div key={`${row.productId}:${row.location}`} className="grid grid-cols-[1.8fr_1fr_repeat(5,0.75fr)] items-center border-b border-surface-2 py-2.5 text-xs last:border-0">
                      <span className="truncate pr-2 text-white">{row.name}<span className="ml-1 text-[#6F665E]">{row.sku}</span></span>
                      <span className="truncate text-muted">{row.location}</span>
                      <span className="text-right font-mono">{row.ownedPhysicalQty}</span>
                      <span className="text-right font-mono">{row.layerQty}</span>
                      <span className={`text-right font-mono ${row.quantityDifference === 0 ? 'text-lime' : 'text-danger-soft'}`}>{row.quantityDifference}</span>
                      <span className="text-right font-mono">{som(row.inventoryValue)}</span>
                      <span className={`text-right font-mono ${row.valueDifference === 0 ? 'text-lime' : 'text-danger-soft'}`}>{som(row.valueDifference)}</span>
                    </div>
                  ))}
                  {reconciliation.quantity.length === 0 && (
                    <div className="py-6 text-center text-xs text-subtle">Количественных остатков нет</div>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* orders by status */}
      <Card>
        <div className="mb-3 font-display text-[15px] font-bold text-white">Заказы по статусам</div>
        {(d?.orders.byStatus ?? []).map((s) => (
          <div
            key={s.status}
            className="flex justify-between border-b border-surface-2 py-2 text-[13px] last:border-0"
          >
            <span className="text-bright">{ORDER_STATUS[s.status] ?? s.status}</span>
            <span className="font-mono tabular">{s.count}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function dispositionFor(diagnosis: QuarantineDiagnosis): QuarantineDisposition {
  return diagnosis === 'resellable' ? 'restock' : diagnosis;
}

function defaultValuationPeriod() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function bishkekDayBoundary(date: string) {
  return new Date(`${date}T00:00:00+06:00`).toISOString();
}

function RollForwardAmount({ value, quantity, strong = false }: { value: number; quantity: number; strong?: boolean }) {
  return (
    <span className={`text-right font-mono ${strong ? 'font-semibold text-white' : 'text-bright'}`} title={`${quantity} ед.`}>
      {som(value)}<span className="ml-1 text-[10px] text-[#6F665E]">{quantity}</span>
    </span>
  );
}

function diagnosisLabel(diagnosis?: QuarantineDiagnosis | null) {
  if (diagnosis === 'resellable') return 'Можно вернуть в продажу';
  if (diagnosis === 'repair') return 'Требуется ремонт';
  if (diagnosis === 'write_off') return 'Требуется списание';
  return 'Диагноз не указан';
}

function dispositionLabel(disposition?: QuarantineDisposition | null) {
  if (disposition === 'restock') return 'возвращено в продажу';
  if (disposition === 'repair') return 'передано в сервис';
  if (disposition === 'write_off') return 'списано';
  return 'не указано';
}

function dispositionAction(diagnosis?: QuarantineDiagnosis | null) {
  if (diagnosis === 'resellable') return 'Вернуть в продажу';
  if (diagnosis === 'repair') return 'Передать в сервис';
  return 'Списать';
}

function ValuationMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="border-l border-line pl-3">
      <div className="text-[11px] text-subtle">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${warning ? 'text-danger-soft' : 'text-white'}`}>{value}</div>
    </div>
  );
}
