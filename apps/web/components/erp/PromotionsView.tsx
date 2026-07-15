'use client';

import { Pause, Play, RefreshCw, Search, TicketPercent } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  activatePromotion,
  createPromotion,
  fetchCatalog,
  fetchPromotions,
  pausePromotion,
  type CatalogProduct,
  type PromotionDiscountType,
  type PromotionView,
} from '@/lib/api';

const FIELD = 'w-full rounded-[7px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none focus:border-coral';
type FormState = {
  code: string; name: string; description: string; discountType: PromotionDiscountType;
  discountValue: string; maxDiscount: string; minimumSubtotal: string;
  totalLimit: string; perCustomerLimit: string; startsAt: string; endsAt: string;
  categories: string; productIds: string[];
};
const EMPTY: FormState = { code: '', name: '', description: '', discountType: 'fixed', discountValue: '', maxDiscount: '', minimumSubtotal: '', totalLimit: '', perCustomerLimit: '', startsAt: '', endsAt: '', categories: '', productIds: [] };

export function PromotionsView({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<PromotionView[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems(await fetchPromotions(accessToken)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load().catch((error) => setNotice(error instanceof Error ? error.message : 'Не удалось загрузить промокоды')); }, [accessToken]);
  useEffect(() => {
    const timer = window.setTimeout(() => fetchCatalog({ q: query.trim() || undefined, limit: 20, sort: 'stock_desc' }).then((result) => setProducts(result.items)).catch(() => setProducts([])), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selected = useMemo(() => new Set(form.productIds), [form.productIds]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleProduct = (id: string) => set('productIds', selected.has(id) ? form.productIds.filter((value) => value !== id) : [...form.productIds, id]);

  async function submit() {
    setBusy(true); setNotice('');
    try {
      const number = (value: string) => value.trim() ? Number(value) : undefined;
      await createPromotion({
        code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || undefined,
        discountType: form.discountType, discountValue: Number(form.discountValue),
        maxDiscount: number(form.maxDiscount), minimumSubtotal: number(form.minimumSubtotal),
        totalLimit: number(form.totalLimit), perCustomerLimit: number(form.perCustomerLimit),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        eligibleProductIds: form.productIds,
        eligibleCategories: form.categories.split(',').map((value) => value.trim()).filter(Boolean),
      }, accessToken);
      setForm(EMPTY);
      setNotice('Черновик промокода создан. Активируйте его после проверки условий.');
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Промокод не создан'); }
    finally { setBusy(false); }
  }

  async function transition(item: PromotionView, action: 'activate' | 'pause') {
    setBusy(true); setNotice('');
    try {
      if (action === 'activate') await activatePromotion(item.id, accessToken);
      else await pausePromotion(item.id, accessToken);
      setNotice(action === 'activate' ? `${item.code} доступен в корзине` : `${item.code} приостановлен`);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Статус не изменён'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
    <section className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-[8px] bg-lime text-lime-ink"><TicketPercent size={20} /></span><div><h2 className="font-bold">Новый промокод</h2><p className="mt-1 text-xs text-[#8A7F76]">Создаётся как черновик и не влияет на checkout до активации.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Код"><input className={`${FIELD} uppercase`} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="BACK2SCHOOL" /></Field>
        <Field label="Название"><input className={FIELD} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Скидка к учебному году" /></Field>
        <Field label="Тип скидки"><select className={FIELD} value={form.discountType} onChange={(e) => set('discountType', e.target.value as PromotionDiscountType)}><option value="fixed">Сумма, сом</option><option value="percent">Процент</option></select></Field>
        <Field label={form.discountType === 'fixed' ? 'Скидка, сом' : 'Скидка, %'}><input type="number" min="1" max={form.discountType === 'percent' ? 100 : undefined} className={FIELD} value={form.discountValue} onChange={(e) => set('discountValue', e.target.value)} /></Field>
        <Field label="Максимальная скидка"><input type="number" min="1" className={FIELD} value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} placeholder="без лимита" /></Field>
        <Field label="Минимальный чек"><input type="number" min="0" className={FIELD} value={form.minimumSubtotal} onChange={(e) => set('minimumSubtotal', e.target.value)} placeholder="0" /></Field>
        <Field label="Общий лимит"><input type="number" min="1" className={FIELD} value={form.totalLimit} onChange={(e) => set('totalLimit', e.target.value)} placeholder="без лимита" /></Field>
        <Field label="На одного клиента"><input type="number" min="1" className={FIELD} value={form.perCustomerLimit} onChange={(e) => set('perCustomerLimit', e.target.value)} placeholder="без лимита" /></Field>
        <Field label="Начало"><input type="datetime-local" className={FIELD} value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
        <Field label="Окончание"><input type="datetime-local" className={FIELD} value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
      </div>
      <Field label="Описание"><textarea className={`${FIELD} mt-3 min-h-20`} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Категории через запятую"><input className={`${FIELD} mt-3`} value={form.categories} onChange={(e) => set('categories', e.target.value)} placeholder="phones, accessories" /></Field>
      <div className="mt-4"><label className="relative block"><Search size={15} className="absolute left-3 top-2.5 text-[#8A7F76]" /><input className={`${FIELD} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ограничить конкретными товарами" /></label><div className="mt-2 max-h-48 overflow-y-auto rounded-[7px] border border-[#2E2822]">{products.map((product) => <button key={product.id} type="button" onClick={() => toggleProduct(product.id)} className="flex w-full items-center gap-2 border-b border-[#2E2822] px-3 py-2 text-left last:border-0 hover:bg-[#221E19]"><span className={`grid h-5 w-5 place-items-center rounded-[5px] text-xs ${selected.has(product.id) ? 'bg-lime text-lime-ink' : 'border border-[#3A342E]'}`}>{selected.has(product.id) ? '✓' : ''}</span><span className="min-w-0 flex-1 truncate text-xs">{product.name}</span><small className="text-[#8A7F76]">{product.sku}</small></button>)}</div><p className="mt-2 text-[11px] text-[#8A7F76]">Без товаров и категорий промокод действует на весь чек. Выбрано товаров: {form.productIds.length}.</p></div>
      <button type="button" disabled={busy || !form.code.trim() || !form.name.trim() || Number(form.discountValue) <= 0} onClick={submit} className="mt-5 w-full rounded-[8px] bg-lime px-4 py-3 text-sm font-bold text-lime-ink disabled:opacity-40">Создать черновик</button>
    </section>

    <section className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">Промокоды</h2><p className="mt-1 text-xs text-[#8A7F76]">Фактические применения считаются по созданным заказам.</p></div><button type="button" onClick={() => load()} disabled={loading} title="Обновить" className="grid h-9 w-9 place-items-center rounded-[7px] border border-[#3A342E] text-[#A79C92]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
      {notice && <p className="mt-4 text-sm text-[#E5B23C]">{notice}</p>}
      <div className="mt-4 grid gap-3">{!loading && items.length === 0 && <div className="rounded-[8px] border border-dashed border-[#3A342E] px-5 py-12 text-center text-sm text-[#8A7F76]">Промокодов пока нет.</div>}{items.map((item) => <article key={item.id} className="rounded-[8px] border border-[#2E2822] bg-[#16130F] p-4"><div className="flex flex-wrap items-start gap-3"><div><div className="font-mono text-sm font-bold text-white">{item.code}</div><div className="mt-1 text-xs text-[#A79C92]">{item.name}</div></div><Status value={item.effectiveStatus} /><div className="ml-auto text-right"><div className="font-bold text-lime">{item.discountType === 'fixed' ? `${item.discountValue.toLocaleString('ru-RU')} с` : `${item.discountValue}%`}</div><div className="text-[11px] text-[#8A7F76]">использовано {item.redemptionCount ?? 0}{item.totalLimit ? ` / ${item.totalLimit}` : ''}</div></div></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#8A7F76] md:grid-cols-4"><Meta label="Мин. чек" value={`${item.minimumSubtotal.toLocaleString('ru-RU')} с`} /><Meta label="На клиента" value={item.perCustomerLimit?.toString() ?? 'без лимита'} /><Meta label="Товары" value={item.eligibleProductIds.length ? `${item.eligibleProductIds.length} выбрано` : 'все'} /><Meta label="Категории" value={item.eligibleCategories.join(', ') || 'все'} /></div><div className="mt-4 flex flex-wrap gap-2">{item.effectiveStatus !== 'active' && item.effectiveStatus !== 'expired' && <button type="button" disabled={busy} onClick={() => transition(item, 'activate')} className="inline-flex items-center gap-1.5 rounded-[7px] bg-coral px-3 py-2 text-xs font-bold text-white"><Play size={13} /> Активировать</button>}{(item.effectiveStatus === 'active' || item.effectiveStatus === 'scheduled') && <button type="button" disabled={busy} onClick={() => transition(item, 'pause')} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#E5B23C] px-3 py-2 text-xs font-bold text-[#E5B23C]"><Pause size={13} /> Приостановить</button>}</div></article>)}</div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs text-[#A79C92]"><span>{label}</span>{children}</label>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><span className="block text-[#6E645C]">{label}</span><b className="mt-0.5 block font-medium text-[#C8BEB5]">{value}</b></div>; }
function Status({ value }: { value: PromotionView['effectiveStatus'] }) { const labels = { draft: 'черновик', active: 'активен', paused: 'пауза', scheduled: 'по расписанию', expired: 'истёк' }; const tone = value === 'active' ? 'bg-lime/10 text-lime' : value === 'expired' ? 'bg-coral/10 text-coral' : value === 'scheduled' ? 'bg-[#E5B23C]/10 text-[#E5B23C]' : 'bg-[#2E2822] text-[#A79C92]'; return <span className={`rounded-[6px] px-2 py-1 text-[11px] font-bold ${tone}`}>{labels[value]}</span>; }
