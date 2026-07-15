'use client';

import { ArrowDown, ArrowUp, CalendarClock, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelStorefrontSchedule,
  createStorefrontRevision,
  fetchCatalog,
  fetchStorefrontContent,
  fetchStorefrontRevisions,
  publishStorefrontRevision,
  scheduleStorefrontRevision,
  type CatalogProduct,
  type StorefrontContent,
} from '@/lib/api';
import { ReviewModerationView } from './ReviewModerationView';

const FIELD = 'w-full rounded-[8px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none focus:border-coral';

export function StorefrontView({ accessToken }: { accessToken: string }) {
  const [mode, setMode] = useState<'content' | 'reviews'>('content');
  const [form, setForm] = useState<StorefrontContent | null>(null);
  const [revisions, setRevisions] = useState<StorefrontContent[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [knownProducts, setKnownProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [payload, history] = await Promise.all([
      fetchStorefrontContent(),
      fetchStorefrontRevisions(accessToken),
    ]);
    if (payload) {
      setForm(payload.content);
      setKnownProducts((current) => mergeProducts(current, payload.featuredProducts));
    }
    setRevisions(history);
  }

  useEffect(() => {
    load().catch(() => setNotice('Не удалось загрузить CMS витрины'));
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCatalog({ q: query.trim() || undefined, limit: 30, sort: 'stock_desc' })
        .then((response) => {
          setProducts(response.items);
          setKnownProducts((current) => mergeProducts(current, response.items));
        })
        .catch(() => setProducts([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const byId = useMemo(() => new Map(knownProducts.map((product) => [product.id, product])), [knownProducts]);

  const tabs = <div className="mb-4 flex flex-wrap gap-2"><button type="button" onClick={() => setMode('content')} className={`rounded-[7px] border px-4 py-2 text-xs font-bold ${mode === 'content' ? 'border-coral bg-coral text-white' : 'border-[#2E2822] bg-[#1A1611] text-[#A79C92]'}`}>Витрина и подборки</button><button type="button" onClick={() => setMode('reviews')} className={`rounded-[7px] border px-4 py-2 text-xs font-bold ${mode === 'reviews' ? 'border-coral bg-coral text-white' : 'border-[#2E2822] bg-[#1A1611] text-[#A79C92]'}`}>Модерация отзывов</button></div>;

  if (mode === 'reviews') return <>{tabs}<ReviewModerationView accessToken={accessToken} /></>;
  if (!form) return <>{tabs}<div className="text-sm text-[#8A7F76]">Загрузка CMS витрины...</div></>;

  const set = (key: keyof StorefrontContent, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!form) return;
    const { id: _id, version: _version, status: _status, publishedAt: _publishedAt, startsAt: _startsAt, endsAt: _endsAt, ...input } = form;
    await run(async () => {
      const revision = await createStorefrontRevision(input, accessToken);
      setNotice(`Черновик v${revision.version} сохранён`);
    }, 'Черновик сохранён');
  }

  function toggleProduct(id: string) {
    setForm((current) => {
      if (!current) return current;
      const exists = current.featuredProductIds.includes(id);
      if (!exists && current.featuredProductIds.length >= 12) {
        setNotice('В подборке может быть не больше 12 товаров');
        return current;
      }
      return {
        ...current,
        featuredProductIds: exists
          ? current.featuredProductIds.filter((productId) => productId !== id)
          : [...current.featuredProductIds, id],
      };
    });
  }

  function moveProduct(index: number, direction: -1 | 1) {
    setForm((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.featuredProductIds.length) return current;
      const ids = [...current.featuredProductIds];
      [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
      return { ...current, featuredProductIds: ids };
    });
  }

  function updateBenefit(index: number, key: 'title' | 'body', value: string) {
    setForm((current) => current ? {
      ...current,
      benefits: current.benefits.map((benefit, benefitIndex) => benefitIndex === index ? { ...benefit, [key]: value } : benefit),
    } : current);
  }

  function addBenefit() {
    setForm((current) => current && current.benefits.length < 4
      ? { ...current, benefits: [...current.benefits, { title: '', body: '' }] }
      : current);
  }

  function removeBenefit(index: number) {
    setForm((current) => current ? { ...current, benefits: current.benefits.filter((_, benefitIndex) => benefitIndex !== index) } : current);
  }

  return (
    <>{tabs}<div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
      <section className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Контент клиентского сайта</h2>
            <p className="mt-1 text-xs text-[#8A7F76]">Черновик не меняет сайт, пока его не опубликовали или не запланировали.</p>
          </div>
          <button disabled={busy} onClick={saveDraft} className="rounded-[8px] bg-lime px-4 py-2.5 text-sm font-bold text-lime-ink disabled:opacity-50">Сохранить черновик</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Field label="Метка"><input className={FIELD} value={form.heroEyebrow} onChange={(event) => set('heroEyebrow', event.target.value)} /></Field>
          <Field label="Заголовок"><input className={FIELD} value={form.heroTitle} onChange={(event) => set('heroTitle', event.target.value)} /></Field>
          <Field label="Описание"><textarea className={`${FIELD} min-h-24`} value={form.heroBody} onChange={(event) => set('heroBody', event.target.value)} /></Field>
          <Field label="HTTPS URL изображения"><input className={FIELD} value={form.heroImageUrl ?? ''} onChange={(event) => set('heroImageUrl', event.target.value)} /></Field>
          <Field label="Кнопка"><input className={FIELD} value={form.heroCtaLabel} onChange={(event) => set('heroCtaLabel', event.target.value)} /></Field>
          <Field label="Ссылка"><input className={FIELD} value={form.heroCtaHref} onChange={(event) => set('heroCtaHref', event.target.value)} /></Field>
          <Field label="Заголовок о компании"><input className={FIELD} value={form.aboutTitle} onChange={(event) => set('aboutTitle', event.target.value)} /></Field>
          <Field label="О компании"><textarea className={`${FIELD} min-h-28`} value={form.aboutBody} onChange={(event) => set('aboutBody', event.target.value)} /></Field>
          <Field label="Заголовок доставки"><input className={FIELD} value={form.deliveryTitle} onChange={(event) => set('deliveryTitle', event.target.value)} /></Field>
          <Field label="Доставка"><textarea className={`${FIELD} min-h-28`} value={form.deliveryBody} onChange={(event) => set('deliveryBody', event.target.value)} /></Field>
          <Field label="Телефон"><input className={FIELD} value={form.contactPhone ?? ''} onChange={(event) => set('contactPhone', event.target.value)} /></Field>
          <Field label="Часы поддержки"><input className={FIELD} value={form.supportHours ?? ''} onChange={(event) => set('supportHours', event.target.value)} /></Field>
        </div>

        <div className="mt-6 border-t border-[#2E2822] pt-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Преимущества</h3><button type="button" disabled={form.benefits.length >= 4} onClick={addBenefit} className="grid h-8 w-8 place-items-center rounded-[7px] border border-[#3A342E] text-lime disabled:opacity-40" title="Добавить преимущество"><Plus size={15} /></button></div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {form.benefits.map((benefit, index) => <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-[8px] border border-[#2E2822] bg-[#221E19] p-3"><div className="grid gap-2"><input className={FIELD} value={benefit.title} placeholder="Заголовок" onChange={(event) => updateBenefit(index, 'title', event.target.value)} /><input className={FIELD} value={benefit.body} placeholder="Подтверждаемое описание" onChange={(event) => updateBenefit(index, 'body', event.target.value)} /></div><button type="button" onClick={() => removeBenefit(index)} className="grid h-8 w-8 place-items-center rounded-[7px] text-[#A79C92] hover:bg-[#2E2822] hover:text-coral" title="Удалить"><Trash2 size={15} /></button></div>)}
          </div>
        </div>

        <div className="mt-6 border-t border-[#2E2822] pt-5">
          <h3 className="text-sm font-bold">Подборка на главной</h3>
          <Field label="Заголовок подборки"><input className={FIELD} value={form.featuredTitle} onChange={(event) => set('featuredTitle', event.target.value)} /></Field>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <label className="relative block"><Search className="absolute left-3 top-2.5 text-[#8A7F76]" size={16} /><input className={`${FIELD} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, SKU, категории" /></label>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-[8px] border border-[#2E2822]">
                {products.map((product) => {
                  const selected = form.featuredProductIds.includes(product.id);
                  return <button key={product.id} type="button" onClick={() => toggleProduct(product.id)} className="flex w-full items-center gap-3 border-b border-[#2E2822] px-3 py-2 text-left last:border-0 hover:bg-[#221E19]"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] ${selected ? 'bg-lime text-lime-ink' : 'border border-[#3A342E] text-[#8A7F76]'}`}>{selected ? '✓' : '+'}</span><span className="min-w-0"><b className="block truncate text-xs">{product.name}</b><small className="text-[#8A7F76]">{product.sku} · {product.availableUnits} шт.</small></span></button>;
                })}
              </div>
            </div>
            <div className="rounded-[8px] border border-[#2E2822] bg-[#221E19] p-3">
              <div className="text-xs text-[#8A7F76]">Порядок на сайте · {form.featuredProductIds.length}/12</div>
              <div className="mt-2 grid gap-2">
                {form.featuredProductIds.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-[7px] bg-[#16130F] px-2 py-2"><span className="w-5 text-xs text-[#8A7F76]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs">{byId.get(id)?.name ?? id}</span><IconButton title="Выше" disabled={index === 0} onClick={() => moveProduct(index, -1)}><ArrowUp size={14} /></IconButton><IconButton title="Ниже" disabled={index === form.featuredProductIds.length - 1} onClick={() => moveProduct(index, 1)}><ArrowDown size={14} /></IconButton><IconButton title="Убрать" onClick={() => toggleProduct(id)}><Trash2 size={14} /></IconButton></div>)}
                {form.featuredProductIds.length === 0 && <div className="py-8 text-center text-xs text-[#8A7F76]">Без ручной подборки сайт покажет товары с наибольшим остатком.</div>}
              </div>
            </div>
          </div>
        </div>
        {notice && <p className="mt-4 text-sm text-[#E5B23C]">{notice}</p>}
      </section>

      <aside className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
        <h2 className="font-bold">Публикации</h2>
        <div className="mt-4 rounded-[8px] border border-[#2E2822] bg-[#221E19] p-3">
          <div className="flex items-center gap-2 text-xs font-bold"><CalendarClock size={15} className="text-lime" /> Расписание для черновика</div>
          <div className="mt-3 grid gap-2"><Field label="Начало"><input type="datetime-local" className={FIELD} min={localDateTime(new Date())} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field><Field label="Окончание (необязательно)"><input type="datetime-local" className={FIELD} min={startsAt || localDateTime(new Date())} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field></div>
        </div>
        <div className="mt-4 grid gap-2">
          {revisions.map((revision) => <div key={revision.id} className="rounded-[8px] border border-[#2E2822] bg-[#221E19] p-3"><div className="flex items-center justify-between"><b>v{revision.version}</b><Status value={revision.status} /></div><div className="mt-1 text-xs text-[#A79C92]">{revision.heroTitle}</div><div className="mt-1 text-[11px] text-[#8A7F76]">{revision.featuredProductIds.length} товаров в подборке</div>{revision.startsAt && <div className="mt-2 text-[11px] text-[#E5B23C]">{formatPeriod(revision.startsAt, revision.endsAt)}</div>}<div className="mt-3 flex flex-wrap gap-2">{revision.status === 'draft' && <><button disabled={busy} onClick={() => run(() => publishStorefrontRevision(revision.id, accessToken), `Версия v${revision.version} опубликована`)} className="rounded-[7px] bg-coral px-3 py-1.5 text-xs font-bold text-white">Опубликовать сейчас</button><button disabled={busy || !startsAt} onClick={() => run(() => scheduleStorefrontRevision(revision.id, { startsAt: new Date(startsAt).toISOString(), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}) }, accessToken), `Версия v${revision.version} запланирована`)} className="rounded-[7px] border border-lime px-3 py-1.5 text-xs font-bold text-lime disabled:opacity-40">Запланировать</button></>}{revision.status === 'scheduled' && <button disabled={busy} onClick={() => run(() => cancelStorefrontSchedule(revision.id, accessToken), `Расписание v${revision.version} отменено`)} className="rounded-[7px] border border-[#E5B23C] px-3 py-1.5 text-xs font-bold text-[#E5B23C]">Отменить расписание</button>}</div></div>)}
        </div>
      </aside>
    </div></>
  );
}

function mergeProducts(current: CatalogProduct[], incoming: CatalogProduct[]) {
  const byId = new Map(current.map((product) => [product.id, product]));
  incoming.forEach((product) => byId.set(product.id, product));
  return [...byId.values()];
}

function localDateTime(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function formatPeriod(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt).toLocaleString('ru-RU');
  return endsAt ? `${start} — ${new Date(endsAt).toLocaleString('ru-RU')}` : `с ${start}`;
}

function Status({ value }: { value: string }) {
  const tone = value === 'published' ? 'text-lime' : value === 'scheduled' ? 'text-[#E5B23C]' : 'text-[#8A7F76]';
  const label = value === 'published' ? 'опубликовано' : value === 'scheduled' ? 'по расписанию' : value === 'archived' ? 'архив' : 'черновик';
  return <span className={`text-xs ${tone}`}>{label}</span>;
}

function IconButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[#A79C92] hover:bg-[#2E2822] hover:text-white disabled:opacity-30">{children}</button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs text-[#A79C92]"><span>{label}</span>{children}</label>;
}
