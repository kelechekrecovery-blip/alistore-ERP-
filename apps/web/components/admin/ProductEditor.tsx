'use client';

import { som } from '@/lib/format';
import {
  inputCls,
  labelCls,
  mutedButtonCls,
  productMargin,
  type ProductForm,
} from '@/lib/admin-product-form';
import type { AdminProduct } from '@/lib/api';

interface ProductEditorProps {
  selected: AdminProduct | null;
  form: ProductForm;
  busy: string;
  onUpdateForm: (patch: Partial<ProductForm>) => void;
  onSave: () => void;
  onStartCreate: () => void;
  onAutoCategory: () => void;
  onAutoDescription: () => void;
  priceDraft: string;
  onPriceDraftChange: (value: string) => void;
  priceReason: string;
  onPriceReasonChange: (value: string) => void;
  onRequestPrice: () => void;
  archiveReason: string;
  onArchiveReasonChange: (value: string) => void;
  onRequestArchive: () => void;
}

/**
 * Right column of the admin catalog: the product form (with AI auto-category / description
 * actions) plus the price-change and archive request cards that route through approvals.
 * Presentational — form state, AI calls, and approval requests live in the page.
 */
export function ProductEditor({
  selected,
  form,
  busy,
  onUpdateForm,
  onSave,
  onStartCreate,
  onAutoCategory,
  onAutoDescription,
  priceDraft,
  onPriceDraftChange,
  priceReason,
  onPriceReasonChange,
  onRequestPrice,
  archiveReason,
  onArchiveReasonChange,
  onRequestArchive,
}: ProductEditorProps) {
  return (
    <section className="min-h-0 overflow-y-auto px-4 py-5 md:px-6">
      <div className="mx-auto grid max-w-[1120px] gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <div className="font-display text-xl font-bold">
                {selected ? selected.sku : 'Новый товар'}
              </div>
              <div className="mt-1 text-sm text-[#8A7F76]">
                {selected ? 'Обычные поля сохраняются сразу. Цена и архив идут через approval.' : 'Создание товара добавит карточку в каталог.'}
              </div>
            </div>
            {selected && (
              <div className="ml-auto flex flex-wrap gap-2">
                <span className="rounded-chip bg-[#221E19] px-3 py-1.5 text-xs font-semibold text-[#D8CFC6]">
                  Маржа {productMargin(selected)}%
                </span>
                <span className="rounded-chip bg-[#221E19] px-3 py-1.5 text-xs font-semibold text-[#D8CFC6]">
                  Остаток {selected.availableUnits}
                </span>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>SKU</label>
              <input
                value={form.sku}
                disabled={Boolean(selected)}
                onChange={(event) => onUpdateForm({ sku: event.target.value })}
                placeholder="IPHONE-15-128-BLK"
                className={`${inputCls} disabled:text-[#6E645C]`}
              />
            </div>
            <div>
              <label htmlFor="product-barcode" className={labelCls}>Штрихкод варианта</label>
              <input
                id="product-barcode"
                value={form.barcode}
                onChange={(event) => onUpdateForm({ barcode: event.target.value })}
                placeholder="194253404842"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="product-variant-group" className={labelCls}>Семья вариантов</label>
              <input
                id="product-variant-group"
                value={form.variantGroup}
                onChange={(event) => onUpdateForm({ variantGroup: event.target.value })}
                placeholder="iphone-15"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Категория</label>
              <div className="flex gap-2">
                <input
                  value={form.category}
                  onChange={(event) => onUpdateForm({ category: event.target.value })}
                  placeholder="phones"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={onAutoCategory}
                  disabled={busy === 'category' || !form.name.trim()}
                  className="w-[150px] rounded-[10px] bg-lime px-3 py-2 text-sm font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                >
                  {busy === 'category' ? '…' : 'Авто-категория'}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Название</label>
              <input
                value={form.name}
                onChange={(event) => onUpdateForm({ name: event.target.value })}
                placeholder="iPhone 15 128GB Black"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Цена</label>
              <input
                value={form.price}
                disabled={Boolean(selected)}
                onChange={(event) => onUpdateForm({ price: event.target.value })}
                placeholder="109900"
                inputMode="numeric"
                className={`${inputCls} disabled:text-[#6E645C]`}
              />
            </div>
            <div>
              <label className={labelCls}>Себестоимость</label>
              <input
                value={form.cost}
                onChange={(event) => onUpdateForm({ cost: event.target.value })}
                placeholder="92000"
                inputMode="numeric"
                className={inputCls}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="product-bundle" className={labelCls}>Состав набора</label>
              <textarea
                id="product-bundle"
                value={form.bundleText}
                onChange={(event) => onUpdateForm({ bundleText: event.target.value })}
                rows={4}
                placeholder={'IPHONE-15-128-BLK × 1\nCASE-IP15-BLK × 1'}
                className={`${inputCls} resize-y font-mono`}
              />
              <p className="mt-1.5 text-xs text-[#6E645C]">Пусто для обычного товара. Вложенные наборы запрещены.</p>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <label htmlFor="product-attrs" className={`${labelCls} mb-0`}>Attrs JSON</label>
                <button
                  type="button"
                  onClick={onAutoDescription}
                  disabled={busy === 'description' || !form.name.trim()}
                  className="ml-auto rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-1.5 text-xs font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
                >
                  {busy === 'description' ? 'Генерируем…' : 'Сгенерировать описание'}
                </button>
              </div>
              <textarea
                id="product-attrs"
                value={form.attrsText}
                onChange={(event) => onUpdateForm({ attrsText: event.target.value })}
                rows={12}
                spellCheck={false}
                className="w-full resize-y rounded-[12px] border border-[#2E2822] bg-[#16130F] px-3 py-3 font-mono text-[13px] leading-relaxed text-[#D8CFC6] outline-none focus:border-lime"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#2E2822] pt-4">
            <button
              type="button"
              onClick={onSave}
              disabled={busy === 'save'}
              className="rounded-[12px] bg-coral px-5 py-3 text-sm font-bold text-white transition hover:bg-deep disabled:bg-[#3A342E] disabled:text-[#6E645C]"
            >
              {busy === 'save' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Создать товар'}
            </button>
            <button type="button" onClick={onStartCreate} className={mutedButtonCls}>
              Очистить форму
            </button>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
            <div className="font-display text-base font-bold">Цена</div>
            <p className="mt-1 text-xs leading-relaxed text-[#8A7F76]">
              Изменение до ±15% применится сразу, больше порога попадёт в Approval Inbox.
            </p>
            <label className={`${labelCls} mt-4`}>Новая цена</label>
            <input
              value={priceDraft}
              onChange={(event) => onPriceDraftChange(event.target.value)}
              disabled={!selected}
              inputMode="numeric"
              className={`${inputCls} disabled:text-[#6E645C]`}
            />
            <label className={`${labelCls} mt-3`}>Причина</label>
            <input
              value={priceReason}
              onChange={(event) => onPriceReasonChange(event.target.value)}
              disabled={!selected}
              className={`${inputCls} disabled:text-[#6E645C]`}
            />
            <button
              type="button"
              onClick={onRequestPrice}
              disabled={!selected || busy === 'price'}
              className="mt-4 w-full rounded-[12px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
            >
              {busy === 'price' ? 'Отправляем…' : 'Запросить изменение цены'}
            </button>
          </div>

          <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
            <div className="font-display text-base font-bold">Архивирование</div>
            <p className="mt-1 text-xs leading-relaxed text-[#8A7F76]">
              Архив товара всегда требует approval owner/admin и не удаляет запись физически.
            </p>
            <label className={`${labelCls} mt-4`}>Причина</label>
            <input
              value={archiveReason}
              onChange={(event) => onArchiveReasonChange(event.target.value)}
              disabled={!selected || selected.archived}
              className={`${inputCls} disabled:text-[#6E645C]`}
            />
            <button
              type="button"
              onClick={onRequestArchive}
              disabled={!selected || selected.archived || busy === 'archive'}
              className="mt-4 w-full rounded-[12px] border border-[#FF8A7A]/40 bg-[#FF8A7A]/10 py-3 text-sm font-bold text-[#FF8A7A] disabled:border-[#2E2822] disabled:bg-[#221E19] disabled:text-[#6E645C]"
            >
              {selected?.archived ? 'Уже в архиве' : busy === 'archive' ? 'Отправляем…' : 'Запросить архив'}
            </button>
          </div>

          <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
            <div className="font-display text-base font-bold">AI-поля</div>
            <div className="mt-3 grid gap-2 text-sm text-[#A79C92]">
              <div className="flex items-center justify-between gap-3">
                <span>Категория</span>
                <span className="font-mono text-lime">{form.category || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Описание</span>
                <span className="font-mono text-lime">
                  {form.attrsText.includes('"description"') ? 'в attrs' : '—'}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
