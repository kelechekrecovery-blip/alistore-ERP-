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
import {
  emptyForm,
  formFromProduct,
  parseAttrs,
  parseSom,
  type ProductForm,
} from '@/lib/admin-product-form';
import { ProductList } from '@/components/admin/ProductList';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

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
    const token = session?.accessToken;
    if (!token) return;
    await withBusy('category', async () => {
      const attrs = parseAttrs(form.attrsText);
      const result = await suggestCategory({ name: form.name.trim(), attrs }, token);
      updateForm({ category: result.category });
      flash(`Категория: ${result.category} · ${Math.round(result.confidence * 100)}%`);
    });
  }

  async function autoDescription() {
    const token = session?.accessToken;
    if (!token) return;
    await withBusy('description', async () => {
      const attrs = parseAttrs(form.attrsText);
      const result = await generateDescription({
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        attrs,
      }, token);
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
        <ProductList
          products={products}
          loading={loading}
          total={total}
          selectedId={selectedId}
          query={query}
          includeArchived={includeArchived}
          onQueryChange={setQuery}
          onSearch={() => void load()}
          onIncludeArchivedChange={setIncludeArchived}
          onSelect={selectProduct}
          onStartCreate={startCreate}
        />

        <ProductEditor
          selected={selected}
          form={form}
          busy={busy}
          onUpdateForm={updateForm}
          onSave={() => void saveProduct()}
          onStartCreate={startCreate}
          onAutoCategory={() => void autoCategory()}
          onAutoDescription={() => void autoDescription()}
          priceDraft={priceDraft}
          onPriceDraftChange={setPriceDraft}
          priceReason={priceReason}
          onPriceReasonChange={setPriceReason}
          onRequestPrice={() => void requestPrice()}
          archiveReason={archiveReason}
          onArchiveReasonChange={setArchiveReason}
          onRequestArchive={() => void requestArchive()}
        />
      </main>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-[12px] bg-lime px-6 py-3 text-center text-sm font-semibold text-lime-ink shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
