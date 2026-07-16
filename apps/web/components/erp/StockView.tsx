'use client';

import { Camera, Check, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Card } from './Card';
import { som } from '@/lib/format';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import {
  diagnoseInventoryQuarantine,
  disposeInventoryQuarantine,
  fetchInventoryQuarantine,
  fetchInventoryValuationReconciliation,
  uploadEvidenceImage,
  type InventoryQuarantineCase,
  type InventoryValuationReconciliation,
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
  const [quarantine, setQuarantine] = useState<InventoryQuarantineCase[] | null>(null);
  const [quarantineError, setQuarantineError] = useState('');
  const [busyCase, setBusyCase] = useState('');
  const [diagnosis, setDiagnosis] = useState<Record<string, QuarantineDiagnosis>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, File | null>>({});
  const canReadFinance = role === 'admin' || role === 'owner';
  const canManageQuarantine = role === 'admin' || role === 'owner' || role === 'warehouse';

  const loadQuarantine = useCallback(() => {
    if (!canManageQuarantine) return;
    setQuarantineError('');
    fetchInventoryQuarantine(accessToken)
      .then(setQuarantine)
      .catch((error) => setQuarantineError(error instanceof Error ? error.message : 'Карантин недоступен'));
  }, [accessToken, canManageQuarantine]);

  useEffect(() => {
    fetchCatalog({ limit: 200 })
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
          <div className="text-xs text-[#8A7F76]">Позиций</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-white">
            {products === null ? '…' : items.length}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-[#8A7F76]">На сумму</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-white">{som(totalValue)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[#8A7F76]">Мало остатка</div>
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
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] border-b border-[#2E2822] pb-2 text-xs text-[#8A7F76]">
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
                className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center border-b border-[#221E19] py-2.5 text-[13px] last:border-0"
              >
                <span className="truncate pr-2 text-white">{p.name}</span>
                <span className="text-right font-mono" style={{ color: chip.color }}>
                  {p.availableUnits}
                </span>
                <span className="text-right font-mono text-[#D8CFC6]">{som(p.price)}</span>
                <span className="text-right">
                  <span
                    className="rounded-chip px-2 py-0.5 text-[11px]"
                    style={{ background: `${chip.color}1a`, color: chip.color }}
                  >
                    {chip.label}
                  </span>
                </span>
              </div>
            );
          })}
          {products !== null && items.length === 0 && (
            <div className="py-8 text-center text-sm text-[#8A7F76]">Каталог пуст</div>
          )}
        </div>
      </Card>

      {canManageQuarantine && (
        <Card>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
                <ShieldCheck size={17} className="text-[#E5B23C]" /> Карантин возвратных IMEI
              </div>
              <div className="mt-0.5 text-xs text-[#8A7F76]">Фото и диагноз фиксирует один сотрудник, решение применяет другой</div>
            </div>
            <button
              type="button"
              title="Обновить карантин"
              aria-label="Обновить карантин"
              onClick={loadQuarantine}
              className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-[#3A342E] text-[#A79C92] hover:border-[#5A5148] hover:text-white"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {quarantineError && (
            <div role="alert" className="mb-3 rounded-[7px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/10 p-3 text-sm text-[#FF8A7A]">
              {quarantineError}
            </div>
          )}
          {quarantine === null && !quarantineError && (
            <div className="py-8 text-center text-sm text-[#8A7F76]">Загружаем очередь карантина…</div>
          )}
          {quarantine?.length === 0 && (
            <div className="py-8 text-center text-sm text-[#8A7F76]">Устройств на карантине нет</div>
          )}
          <div className="divide-y divide-[#221E19]">
            {quarantine?.map((item) => (
              <div key={item.id} data-testid={`quarantine-${item.id}`} className="grid gap-3 py-4 first:pt-1 lg:grid-cols-[1.25fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{item.unit.product.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-[#A79C92]">
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
                      className="h-9 rounded-[6px] border border-[#3A342E] bg-[#171411] px-2 text-xs text-white"
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
                      className="h-9 min-w-0 rounded-[6px] border border-[#3A342E] bg-[#171411] px-2 text-xs text-white placeholder:text-[#6F665E]"
                    />
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[6px] border border-dashed border-[#4A423A] px-2 text-xs text-[#A79C92] hover:border-[#6A6056] hover:text-white">
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
                      className="flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#E5B23C] px-3 text-xs font-semibold text-[#17120A] disabled:opacity-50"
                    >
                      <Check size={14} /> {busyCase === item.id ? 'Сохраняем…' : 'Зафиксировать'}
                    </button>
                  </div>
                )}

                {item.status === 'diagnosed' && (
                  <div className="text-xs">
                    <div className="font-semibold text-[#E5B23C]">{diagnosisLabel(item.diagnosis)}</div>
                    <div className="mt-1 text-[#8A7F76]">Диагност: {item.diagnosedBy}</div>
                    {item.notes && <div className="mt-1 text-[#D8CFC6]">{item.notes}</div>}
                  </div>
                )}

                {item.status === 'disposed' && (
                  <div className="text-xs">
                    <div className="font-semibold text-lime">Решение выполнено: {dispositionLabel(item.disposition)}</div>
                    <div className="mt-1 text-[#8A7F76]">Исполнитель: {item.disposedBy}</div>
                  </div>
                )}

                <div className="flex justify-end">
                  {item.status === 'diagnosed' ? (
                    item.diagnosedBy === staffId ? (
                      <span className="rounded-chip bg-[#E5B23C]/10 px-2 py-1 text-[11px] text-[#E5B23C]">
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
                    <span className={`rounded-chip px-2 py-1 text-[11px] ${item.status === 'disposed' ? 'bg-lime/10 text-lime' : 'bg-[#E5B23C]/10 text-[#E5B23C]'}`}>
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
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-display text-[15px] font-bold text-white">Оценка запасов и GL 1200</div>
              <div className="mt-0.5 text-xs text-[#8A7F76]">Собственный товар по себестоимости, без комиссии</div>
            </div>
            {reconciliation && (
              <span className={`rounded-chip px-2 py-1 text-[11px] ${reconciliation.summary.consistent ? 'bg-lime/10 text-lime' : 'bg-[#FF8A7A]/10 text-[#FF8A7A]'}`}>
                {reconciliation.summary.consistent ? 'Сходится' : 'Есть расхождения'}
              </span>
            )}
          </div>
          {reconciliationError && (
            <div role="alert" className="rounded-[7px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/10 p-3 text-sm text-[#FF8A7A]">
              {reconciliationError}
            </div>
          )}
          {!reconciliation && !reconciliationError && (
            <div className="py-8 text-center text-sm text-[#8A7F76]">Сверяем FIFO-слои и проводки…</div>
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
                <div className="mt-3 rounded-[7px] border border-[#E5B23C]/30 bg-[#E5B23C]/10 p-3 text-xs text-[#E5B23C]">
                  Неполная оценка: у {reconciliation.summary.missingSerializedCostUnits} серийных единиц не указана себестоимость.
                </div>
              )}
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1.8fr_1fr_repeat(5,0.75fr)] border-b border-[#2E2822] pb-2 text-xs text-[#8A7F76]">
                    <span>Товар</span><span>Склад</span><span className="text-right">Свои ед.</span><span className="text-right">FIFO ед.</span><span className="text-right">Δ ед.</span><span className="text-right">Баланс</span><span className="text-right">Δ сумма</span>
                  </div>
                  {reconciliation.quantity.map((row) => (
                    <div key={`${row.productId}:${row.location}`} className="grid grid-cols-[1.8fr_1fr_repeat(5,0.75fr)] items-center border-b border-[#221E19] py-2.5 text-xs last:border-0">
                      <span className="truncate pr-2 text-white">{row.name}<span className="ml-1 text-[#6F665E]">{row.sku}</span></span>
                      <span className="truncate text-[#A79C92]">{row.location}</span>
                      <span className="text-right font-mono">{row.ownedPhysicalQty}</span>
                      <span className="text-right font-mono">{row.layerQty}</span>
                      <span className={`text-right font-mono ${row.quantityDifference === 0 ? 'text-lime' : 'text-[#FF8A7A]'}`}>{row.quantityDifference}</span>
                      <span className="text-right font-mono">{som(row.inventoryValue)}</span>
                      <span className={`text-right font-mono ${row.valueDifference === 0 ? 'text-lime' : 'text-[#FF8A7A]'}`}>{som(row.valueDifference)}</span>
                    </div>
                  ))}
                  {reconciliation.quantity.length === 0 && (
                    <div className="py-6 text-center text-xs text-[#8A7F76]">Количественных остатков нет</div>
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
            className="flex justify-between border-b border-[#221E19] py-2 text-[13px] last:border-0"
          >
            <span className="text-[#D8CFC6]">{ORDER_STATUS[s.status] ?? s.status}</span>
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
    <div className="border-l border-[#3A342E] pl-3">
      <div className="text-[11px] text-[#8A7F76]">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${warning ? 'text-[#FF8A7A]' : 'text-white'}`}>{value}</div>
    </div>
  );
}
