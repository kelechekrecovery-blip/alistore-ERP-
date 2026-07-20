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
import { ImageField } from '@/components/erp/ImageField';

/**
 * Read the main photo out of the raw attrs JSON the operator is editing.
 * Returns '' when the text is not valid JSON yet — the field then degrades to
 * read-only rather than fighting a half-typed document.
 */
function readAttrsImage(attrsText: string): { url: string; parsable: boolean } {
  try {
    const parsed = JSON.parse(attrsText || '{}') as Record<string, unknown>;
    const value = parsed.imageUrl ?? parsed.image;
    return { url: typeof value === 'string' ? value : '', parsable: true };
  } catch {
    return { url: '', parsable: false };
  }
}

/** Write the main photo back, preserving key order and every other attribute. */
function writeAttrsImage(attrsText: string, url: string): string | null {
  try {
    const parsed = JSON.parse(attrsText || '{}') as Record<string, unknown>;
    if (url) parsed.imageUrl = url;
    else delete parsed.imageUrl;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return null;
  }
}

interface ProductEditorProps {
  selected: AdminProduct | null;
  form: ProductForm;
  busy: string;
  accessToken: string;
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
  accessToken,
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
  const attrsImage = readAttrsImage(form.attrsText);
  return (
    <section className="min-h-0 overflow-y-auto px-4 py-5 md:px-6">
      <div className="mx-auto grid max-w-[1120px] gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <div className="font-display text-xl font-bold">
                {selected ? selected.sku : 'Новый товар'}
              </div>
              <div className="mt-1 text-sm text-subtle">
                {selected ? 'Обычные поля сохраняются сразу. Цена и архив идут через approval.' : 'Создание товара добавит карточку в каталог.'}
              </div>
            </div>
            {selected && (
              <div className="ml-auto flex flex-wrap gap-2">
                <span className="rounded-chip bg-surface-2 px-3 py-1.5 text-xs font-semibold text-bright">
                  Маржа {productMargin(selected)}%
                </span>
                <span className="rounded-chip bg-surface-2 px-3 py-1.5 text-xs font-semibold text-bright">
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
                className={`${inputCls} disabled:text-faint`}
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
                  className="w-[150px] rounded-[10px] bg-lime px-3 py-2 text-sm font-bold text-lime-ink disabled:bg-line disabled:text-faint"
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
                className={`${inputCls} disabled:text-faint`}
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
            <div>
              <label htmlFor="product-tax-code" className={labelCls}>Налоговая категория</label>
              <input
                id="product-tax-code"
                value={form.taxCode}
                onChange={(event) => onUpdateForm({ taxCode: event.target.value })}
                placeholder="vat_standard"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="product-tax-rate" className={labelCls}>Ставка, bps</label>
              <input
                id="product-tax-rate"
                value={form.taxRateBps}
                onChange={(event) => onUpdateForm({ taxRateBps: event.target.value })}
                placeholder="1200"
                inputMode="numeric"
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-faint">1200 bps = 12%. Ставку подтверждает бухгалтер; заказ сохраняет неизменяемый снимок.</p>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Тип складского учёта</label>
              <div className="grid grid-cols-2 gap-2 rounded-[10px] border border-surface-3 bg-ink-dark p-1">
                {([
                  ['serialized', 'Серийный / IMEI'],
                  ['quantity', 'Количественный'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdateForm({ trackingMode: value })}
                    className={`rounded-[8px] px-3 py-2.5 text-sm font-semibold transition ${
                      form.trackingMode === value ? 'bg-lime text-lime-ink' : 'text-subtle hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">Тип блокируется сервером после появления остатка или включения товара в набор.</p>
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
              <p className="mt-1.5 text-xs text-faint">Пусто для обычного товара. Вложенные наборы запрещены.</p>
            </div>
            <div className="md:col-span-2">
              {/*
                The photo lives in attrs.imageUrl. It used to be reachable only by
                hand-editing the JSON below, where a typo silently drops the image
                from the storefront — so it gets a real field that reads and writes
                that key while leaving every other attribute untouched.
              */}
              {attrsImage.parsable ? (
                <ImageField
                  label="Фото товара"
                  value={attrsImage.url}
                  onChange={(url) => {
                    const next = writeAttrsImage(form.attrsText, url);
                    if (next !== null) onUpdateForm({ attrsText: next });
                  }}
                  accessToken={accessToken}
                  hint="attrs.imageUrl"
                />
              ) : (
                <p className="mb-1.5 text-xs text-warn">
                  Фото товара редактируется полем, но сейчас Attrs JSON ниже невалиден — исправьте его.
                </p>
              )}
              <div className="mb-1.5 mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="product-attrs" className={`${labelCls} mb-0`}>Attrs JSON</label>
                <button
                  type="button"
                  onClick={onAutoDescription}
                  disabled={busy === 'description' || !form.name.trim()}
                  className="ml-auto rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-1.5 text-xs font-bold text-bright disabled:text-faint"
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
                className="w-full resize-y rounded-[12px] border border-surface-3 bg-ink-dark px-3 py-3 font-mono text-[13px] leading-relaxed text-bright outline-none focus:border-lime"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-surface-3 pt-4">
            <button
              type="button"
              onClick={onSave}
              disabled={busy === 'save'}
              className="rounded-[12px] bg-coral px-5 py-3 text-sm font-bold text-white transition hover:bg-deep disabled:bg-line disabled:text-faint"
            >
              {busy === 'save' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Создать товар'}
            </button>
            <button type="button" onClick={onStartCreate} className={mutedButtonCls}>
              Очистить форму
            </button>
          </div>
        </div>

        <aside className="grid gap-4">
          <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
            <div className="font-display text-base font-bold">Цена</div>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Изменение до ±15% применится сразу, больше порога попадёт в Approval Inbox.
            </p>
            <label className={`${labelCls} mt-4`}>Новая цена</label>
            <input
              value={priceDraft}
              onChange={(event) => onPriceDraftChange(event.target.value)}
              disabled={!selected}
              inputMode="numeric"
              className={`${inputCls} disabled:text-faint`}
            />
            <label className={`${labelCls} mt-3`}>Причина</label>
            <input
              value={priceReason}
              onChange={(event) => onPriceReasonChange(event.target.value)}
              disabled={!selected}
              className={`${inputCls} disabled:text-faint`}
            />
            <button
              type="button"
              onClick={onRequestPrice}
              disabled={!selected || busy === 'price'}
              className="mt-4 w-full rounded-[12px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-line disabled:text-faint"
            >
              {busy === 'price' ? 'Отправляем…' : 'Запросить изменение цены'}
            </button>
          </div>

          <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
            <div className="font-display text-base font-bold">Архивирование</div>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Архив товара всегда требует approval owner/admin и не удаляет запись физически.
            </p>
            <label className={`${labelCls} mt-4`}>Причина</label>
            <input
              value={archiveReason}
              onChange={(event) => onArchiveReasonChange(event.target.value)}
              disabled={!selected || selected.archived}
              className={`${inputCls} disabled:text-faint`}
            />
            <button
              type="button"
              onClick={onRequestArchive}
              disabled={!selected || selected.archived || busy === 'archive'}
              className="mt-4 w-full rounded-[12px] border border-danger-soft/40 bg-danger-soft/10 py-3 text-sm font-bold text-danger-soft disabled:border-surface-3 disabled:bg-surface-2 disabled:text-faint"
            >
              {selected?.archived ? 'Уже в архиве' : busy === 'archive' ? 'Отправляем…' : 'Запросить архив'}
            </button>
          </div>

          <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
            <div className="font-display text-base font-bold">AI-поля</div>
            <div className="mt-3 grid gap-2 text-sm text-muted">
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
