'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  parseBundleComponents,
  parseBasisPoints,
  parseSom,
  type ProductForm,
} from '@/lib/admin-product-form';
import { ProductEditor } from './ProductEditor';
import { ProductList } from './ProductList';

export function ProductManagementView({ accessToken }: { accessToken: string }) {
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
  const loadRequest = useRef(0);

  const selected = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    try {
      const result = await fetchAdminProducts(
        { q: query.trim() || undefined, includeArchived, limit: 50 },
        accessToken,
      );
      if (requestId !== loadRequest.current) return;
      setProducts(result.items);
      setTotal(result.total);
      setSelectedId((current) => {
        if (!current || result.items.some((product) => product.id === current)) return current;
        setForm(emptyForm);
        return null;
      });
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      flash(error instanceof Error ? error.message : 'Не удалось загрузить товары');
      setProducts([]);
      setTotal(0);
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [accessToken, includeArchived, query]);

  useEffect(() => {
    void load();
  }, [load]);

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
    await withBusy('save', async () => {
      const attrs = parseAttrs(form.attrsText);
      const bundleComponents = parseBundleComponents(form.bundleText);
      if (selected) {
        const updated = await updateAdminProduct(
          selected.id,
          {
            barcode: form.barcode.trim(),
            variantGroup: form.variantGroup.trim(),
            name: form.name.trim(),
            cost: parseSom(form.cost, 'Себестоимость'),
            category: form.category.trim(),
            taxCode: form.taxCode.trim(),
            taxRateBps: parseBasisPoints(form.taxRateBps),
            trackingMode: form.trackingMode,
            attrs,
            bundleComponents,
          },
          accessToken,
        );
        flash(`Сохранено: ${updated.sku}`);
        await load();
        setSelectedId(updated.id);
        setForm(formFromProduct(updated));
        return;
      }

      const created = await createAdminProduct(
        {
          sku: form.sku.trim(),
          barcode: form.barcode.trim(),
          variantGroup: form.variantGroup.trim(),
          name: form.name.trim(),
          price: parseSom(form.price, 'Цена'),
          cost: parseSom(form.cost, 'Себестоимость'),
          category: form.category.trim(),
          taxCode: form.taxCode.trim(),
          taxRateBps: parseBasisPoints(form.taxRateBps),
          trackingMode: form.trackingMode,
          attrs,
          bundleComponents,
        },
        accessToken,
      );
      flash(`Создан товар: ${created.sku}`);
      await load();
      setSelectedId(created.id);
      setForm(formFromProduct(created));
      setPriceDraft(String(created.price));
    });
  }

  async function autoCategory() {
    await withBusy('category', async () => {
      const attrs = parseAttrs(form.attrsText);
      const result = await suggestCategory({ name: form.name.trim(), attrs }, accessToken);
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
      }, accessToken);
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
    if (!selected) return;
    await withBusy('price', async () => {
      const result = await requestProductPriceChange(
        selected.id,
        { price: parseSom(priceDraft, 'Новая цена'), reason: priceReason.trim() },
        accessToken,
      );
      flash('applied' in result ? `Цена применена: ${som(result.price)}` : `Approval создан: ${result.approvalId.slice(-8)}`);
      await load();
    });
  }

  async function requestArchive() {
    if (!selected) return;
    await withBusy('archive', async () => {
      const result = await requestProductArchive(
        selected.id,
        { reason: archiveReason.trim() },
        accessToken,
      );
      flash(`Архивация ждёт approval: ${result.approvalId.slice(-8)}`);
      await load();
    });
  }

  return (
    <div
      data-testid="erp-product-management"
      className="relative grid min-h-[620px] overflow-hidden rounded-[8px] border border-surface-3 bg-ink-dark lg:grid-cols-[minmax(300px,360px)_1fr]"
    >
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
      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 max-w-[92%] -translate-x-1/2 rounded-[8px] bg-lime px-6 py-3 text-center text-sm font-semibold text-lime-ink shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
