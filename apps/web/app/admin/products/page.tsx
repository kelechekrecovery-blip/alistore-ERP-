'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAdminProduct,
  fetchAdminProducts,
  requestProductArchive,
  requestProductPriceChange,
  updateAdminProduct,
  type AdminProduct,
} from '@/lib/api';
import { generateDescription, suggestCategory } from '@/lib/ai';
import { som } from '@/lib/format';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

interface ProductForm {
  sku: string;
  name: string;
  price: string;
  cost: string;
  category: string;
  attrsText: string;
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  price: '',
  cost: '',
  category: '',
  attrsText: '{\n  "description": ""\n}',
};

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#8A7F76]';
const inputCls =
  'w-full rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime';
const mutedButtonCls =
  'rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm font-semibold text-[#D8CFC6] transition hover:border-[#3A342E] disabled:cursor-not-allowed disabled:text-[#6E645C]';

function attrsToText(attrs: AdminProduct['attrs'] | undefined): string {
  return JSON.stringify(attrs && typeof attrs === 'object' ? attrs : {}, null, 2);
}

function formFromProduct(product: AdminProduct): ProductForm {
  return {
    sku: product.sku,
    name: product.name,
    price: String(product.price),
    cost: String(product.cost),
    category: product.category,
    attrsText: attrsToText(product.attrs),
  };
}

function parseAttrs(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Attrs должен быть JSON-объектом');
  }
  return parsed as Record<string, unknown>;
}

function parseSom(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label}: укажите целое число >= 0`);
  }
  return parsed;
}

function productMargin(product: AdminProduct): number {
  if (product.price <= 0) return 0;
  return Math.round(((product.price - product.cost) / product.price) * 100);
}

export default function AdminProductsPage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [priceDraft, setPriceDraft] = useState('');
  const [priceReason, setPriceReason] = useState('изменение закупочной цены');
  const [archiveReason, setArchiveReason] = useState('снят с продажи');

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  const selected = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  const load = useCallback(async (nextSession = session) => {
    if (!nextSession) return;
    setLoading(true);
    try {
      const result = await fetchAdminProducts(
        { q: query.trim() || undefined, includeArchived, limit: 50 },
        nextSession.accessToken,
      );
      setProducts(result.items);
      setTotal(result.total);
      if (selectedId && !result.items.some((product) => product.id === selectedId)) {
        setSelectedId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Не удалось загрузить товары');
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [includeArchived, query, selectedId, session]);

  useEffect(() => {
    if (session) void load(session);
  }, [load, session]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  function updateForm(patch: Partial<ProductForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function selectProduct(product: AdminProduct) {
    setSelectedId(product.id);
    setForm(formFromProduct(product));
    setPriceDraft(String(product.price));
    setPriceReason('изменение закупочной цены');
    setArchiveReason('снят с продажи');
  }

  function startCreate() {
    setSelectedId(null);
    setForm(emptyForm);
    setPriceDraft('');
    setPriceReason('изменение закупочной цены');
    setArchiveReason('снят с продажи');
  }

  async function withBusy(label: string, work: () => Promise<void>) {
    if (!session) return;
    setBusy(label);
    try {
      await work();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusy('');
    }
  }

  async function saveProduct() {
    if (!session) return;
    await withBusy('save', async () => {
      const attrs = parseAttrs(form.attrsText);
      if (selected) {
        const updated = await updateAdminProduct(
          selected.id,
          {
            name: form.name.trim(),
            cost: parseSom(form.cost, 'Себестоимость'),
            category: form.category.trim(),
            attrs,
          },
          session.accessToken,
        );
        flash(`Сохранено: ${updated.sku}`);
        await load(session);
        setSelectedId(updated.id);
        setForm(formFromProduct(updated));
      } else {
        const created = await createAdminProduct(
          {
            sku: form.sku.trim(),
            name: form.name.trim(),
            price: parseSom(form.price, 'Цена'),
            cost: parseSom(form.cost, 'Себестоимость'),
            category: form.category.trim(),
            attrs,
          },
          session.accessToken,
        );
        flash(`Создан товар: ${created.sku}`);
        await load(session);
        setSelectedId(created.id);
        setForm(formFromProduct(created));
        setPriceDraft(String(created.price));
      }
    });
  }

  async function autoCategory() {
    await withBusy('category', async () => {
      const attrs = parseAttrs(form.attrsText);
      const result = await suggestCategory({ name: form.name.trim(), attrs });
      updateForm({ category: result.category });
      flash(`Категория: ${result.category} · ${Math.round(result.confidence * 100)}%`);
    });
  }

  async function autoDescription() {
    await withBusy('description', async () => {
      const attrs = parseAttrs(form.attrsText);
      const result = await generateDescription({
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        attrs,
      });
      updateForm({
        attrsText: JSON.stringify(
          { ...attrs, description: result.description, highlights: result.highlights },
          null,
          2,
        ),
      });
      flash(`Описание готово · ${result.source}`);
    });
  }

  async function requestPrice() {
    if (!session || !selected) return;
    await withBusy('price', async () => {
      const result = await requestProductPriceChange(
        selected.id,
        { price: parseSom(priceDraft, 'Новая цена'), reason: priceReason.trim() },
        session.accessToken,
      );
      if ('applied' in result) {
        flash(`Цена применена: ${som(result.price)}`);
      } else {
        flash(`Approval создан: ${result.approvalId.slice(-8)}`);
      }
      await load(session);
    });
  }

  async function requestArchive() {
    if (!session || !selected) return;
    await withBusy('archive', async () => {
      const result = await requestProductArchive(
        selected.id,
        { reason: archiveReason.trim() },
        session.accessToken,
      );
      flash(`Архивация ждёт approval: ${result.approvalId.slice(-8)}`);
      await load(session);
    });
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Выйти
        </Link>
        <StaffSessionLogin
          title="Товары · вход"
          caption="Войдите как admin или owner, чтобы управлять каталогом."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E0C0A] text-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#2E2822] bg-[#16130F]/95 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime font-display text-lg font-extrabold text-lime-ink">
          P
        </span>
        <div>
          <div className="font-display text-lg font-bold">Админ · Товары</div>
          <div className="text-xs text-[#8A7F76]">Каталог, AI-обогащение, price/archive через approvals · {session.username}</div>
        </div>
        <Link
          href="/approvals"
          className="ml-auto rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#D8CFC6] hover:border-[#3A342E]"
        >
          Approval Inbox
        </Link>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
          }}
          className="rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#3A342E]"
        >
          Выйти staff
        </button>
        <Link
          href="/staff"
          className="rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#3A342E]"
        >
          ⌂ Сотрудник
        </Link>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <section className="min-h-0 border-b border-[#2E2822] bg-[#12100D] lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b border-[#2E2822] p-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void load();
              }}
              placeholder="SKU, название, категория"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="h-[42px] rounded-[10px] bg-lime px-4 text-sm font-bold text-lime-ink disabled:opacity-50"
              disabled={loading}
            >
              Найти
            </button>
          </div>
          <div className="flex items-center justify-between border-b border-[#2E2822] px-4 py-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#A79C92]">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
                className="h-4 w-4 accent-[#D7FF5C]"
              />
              С архивом
            </label>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-[10px] bg-coral px-3 py-2 text-xs font-bold text-white transition hover:bg-deep"
            >
              + Новый товар
            </button>
          </div>
          <div className="h-full max-h-[42vh] overflow-y-auto lg:max-h-none">
            {loading && <div className="p-4 font-mono text-sm text-[#8A7F76]">Загрузка…</div>}
            {!loading && products.length === 0 && (
              <div className="p-6 text-sm text-[#8A7F76]">Нет товаров по текущему фильтру.</div>
            )}
            {!loading && products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className={`block w-full border-b border-[#221E19] px-4 py-3 text-left transition ${
                  selectedId === product.id ? 'bg-[#221E19]' : 'hover:bg-[#1A1611]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{product.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-[#8A7F76]">{product.sku}</span>
                      <span className="rounded-chip bg-[#16130F] px-2 py-0.5 text-[11px] font-semibold text-lime">
                        {product.category}
                      </span>
                      {product.archived && (
                        <span className="rounded-chip bg-[#FF8A7A]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FF8A7A]">
                          архив
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold tabular text-white">{som(product.price)}</div>
                    <div className="mt-1 text-[11px] text-[#8A7F76]">остаток {product.availableUnits}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-[#2E2822] px-4 py-3 text-[11px] text-[#6E645C]">
            Показано {products.length} из {total}
          </div>
        </section>

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
                    onChange={(event) => updateForm({ sku: event.target.value })}
                    placeholder="IPHONE-15-128-BLK"
                    className={`${inputCls} disabled:text-[#6E645C]`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Категория</label>
                  <div className="flex gap-2">
                    <input
                      value={form.category}
                      onChange={(event) => updateForm({ category: event.target.value })}
                      placeholder="phones"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => void autoCategory()}
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
                    onChange={(event) => updateForm({ name: event.target.value })}
                    placeholder="iPhone 15 128GB Black"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Цена</label>
                  <input
                    value={form.price}
                    disabled={Boolean(selected)}
                    onChange={(event) => updateForm({ price: event.target.value })}
                    placeholder="109900"
                    inputMode="numeric"
                    className={`${inputCls} disabled:text-[#6E645C]`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Себестоимость</label>
                  <input
                    value={form.cost}
                    onChange={(event) => updateForm({ cost: event.target.value })}
                    placeholder="92000"
                    inputMode="numeric"
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <label className={`${labelCls} mb-0`}>Attrs JSON</label>
                    <button
                      type="button"
                      onClick={() => void autoDescription()}
                      disabled={busy === 'description' || !form.name.trim()}
                      className="ml-auto rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-1.5 text-xs font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
                    >
                      {busy === 'description' ? 'Генерируем…' : 'Сгенерировать описание'}
                    </button>
                  </div>
                  <textarea
                    value={form.attrsText}
                    onChange={(event) => updateForm({ attrsText: event.target.value })}
                    rows={12}
                    spellCheck={false}
                    className="w-full resize-y rounded-[12px] border border-[#2E2822] bg-[#16130F] px-3 py-3 font-mono text-[13px] leading-relaxed text-[#D8CFC6] outline-none focus:border-lime"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#2E2822] pt-4">
                <button
                  type="button"
                  onClick={() => void saveProduct()}
                  disabled={busy === 'save'}
                  className="rounded-[12px] bg-coral px-5 py-3 text-sm font-bold text-white transition hover:bg-deep disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                >
                  {busy === 'save' ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Создать товар'}
                </button>
                <button type="button" onClick={startCreate} className={mutedButtonCls}>
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
                  onChange={(event) => setPriceDraft(event.target.value)}
                  disabled={!selected}
                  inputMode="numeric"
                  className={`${inputCls} disabled:text-[#6E645C]`}
                />
                <label className={`${labelCls} mt-3`}>Причина</label>
                <input
                  value={priceReason}
                  onChange={(event) => setPriceReason(event.target.value)}
                  disabled={!selected}
                  className={`${inputCls} disabled:text-[#6E645C]`}
                />
                <button
                  type="button"
                  onClick={() => void requestPrice()}
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
                  onChange={(event) => setArchiveReason(event.target.value)}
                  disabled={!selected || selected.archived}
                  className={`${inputCls} disabled:text-[#6E645C]`}
                />
                <button
                  type="button"
                  onClick={() => void requestArchive()}
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
      </main>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-[12px] bg-lime px-6 py-3 text-center text-sm font-semibold text-lime-ink shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
