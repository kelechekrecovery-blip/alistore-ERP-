'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { som } from '@/lib/format';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
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
export function StockView({ d }: { d: Dashboard | null }) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 200 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);

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
