'use client';

import { ArrowDown, ArrowUp, Archive, CalendarClock, Image as ImageIcon, Plus, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  archiveStorefrontBlock,
  cancelStorefrontBlockSchedule,
  createStorefrontBlock,
  fetchCatalog,
  fetchStorefrontBlocks,
  publishStorefrontBlock,
  reorderStorefrontBlocks,
  scheduleStorefrontBlock,
  type CatalogProduct,
  type StorefrontBlock,
  type StorefrontBlockDevice,
  type StorefrontBlockType,
} from '@/lib/api';

const FIELD = 'w-full rounded-[8px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none focus:border-coral';

const EMPTY = {
  type: 'promo' as StorefrontBlockType,
  device: 'all' as StorefrontBlockDevice,
  title: '', eyebrow: '', body: '', ctaLabel: '', ctaHref: '/catalog', imageUrl: '', tone: 'dark' as const,
};

export function StorefrontBlocksView({ accessToken }: { accessToken: string }) {
  const [blocks, setBlocks] = useState<StorefrontBlock[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { setBlocks(await fetchStorefrontBlocks(accessToken)); }
  useEffect(() => { load().catch(() => setNotice('Не удалось загрузить блоки')); }, [accessToken]);
  useEffect(() => { fetchCatalog({ limit: 30, sort: 'stock_desc' }).then((result) => setProducts(result.items)).catch(() => setProducts([])); }, []);
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setNotice('');
    try { await action(); setNotice(success); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Операция не выполнена'); }
    finally { setBusy(false); }
  }

  async function create() {
    await run(async () => {
      const block = await createStorefrontBlock({
        ...form,
        eyebrow: form.eyebrow || undefined,
        body: form.body || undefined,
        ctaLabel: form.ctaLabel || undefined,
        ctaHref: form.ctaHref || undefined,
        imageUrl: form.imageUrl || undefined,
        productIds: form.type === 'collection' ? selected : [],
      }, accessToken);
      if (startsAt) await scheduleStorefrontBlock(block.id, { startsAt: new Date(startsAt).toISOString(), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}) }, accessToken);
      setForm(EMPTY); setSelected([]); setStartsAt(''); setEndsAt('');
    }, startsAt ? 'Блок создан и запланирован' : 'Черновик блока создан');
  }

  async function move(index: number, direction: -1 | 1) {
    const active = blocks.filter((block) => block.status !== 'archived');
    const next = index + direction;
    if (next < 0 || next >= active.length) return;
    const ids = active.map((block) => block.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await run(() => reorderStorefrontBlocks(ids, accessToken), 'Порядок блоков обновлён');
  }

  return <div className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
    <section className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="flex items-center gap-2"><Plus size={17} className="text-lime" /><h2 className="font-bold">Новый блок витрины</h2></div>
      <p className="mt-1 text-xs text-[#8A7F76]">Черновик не виден клиентам. Изображения принимаются только по HTTPS.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Тип"><select className={FIELD} value={form.type} onChange={(event) => { setForm({ ...form, type: event.target.value as StorefrontBlockType }); setSelected([]); }}><option value="hero">Главный баннер</option><option value="promo">Промо-блок</option><option value="info">Инфо-блок</option><option value="collection">Подборка</option></select></Field>
        <Field label="Устройства"><select className={FIELD} value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value as StorefrontBlockDevice })}><option value="all">Все</option><option value="desktop">Только desktop</option><option value="mobile">Только mobile</option></select></Field>
        <Field label="Заголовок"><input className={FIELD} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
        <Field label="Метка"><input className={FIELD} value={form.eyebrow} onChange={(event) => setForm({ ...form, eyebrow: event.target.value })} /></Field>
        <Field label="Описание"><textarea className={`${FIELD} min-h-20`} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></Field>
        <Field label="HTTPS изображение"><input className={FIELD} value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://media..." /></Field>
        <Field label="Текст кнопки"><input className={FIELD} value={form.ctaLabel} onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })} /></Field>
        <Field label="Ссылка"><input className={FIELD} value={form.ctaHref} onChange={(event) => setForm({ ...form, ctaHref: event.target.value })} /></Field>
        <Field label="Оформление"><select className={FIELD} value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value as typeof form.tone })}><option value="dark">Тёмное</option><option value="coral">Коралловое</option><option value="light">Светлое</option><option value="lime">Лаймовое</option></select></Field>
      </div>
      {form.type === 'collection' && <div className="mt-4"><div className="text-xs text-[#A79C92]">Товары подборки · {selected.length}/12</div><div className="mt-2 max-h-56 overflow-y-auto rounded-[8px] border border-[#2E2822]">{products.map((product) => <button key={product.id} type="button" onClick={() => setSelected((ids) => ids.includes(product.id) ? ids.filter((id) => id !== product.id) : ids.length < 12 ? [...ids, product.id] : ids)} className="flex w-full items-center gap-2 border-b border-[#2E2822] px-3 py-2 text-left text-xs last:border-0"><span className={selected.includes(product.id) ? 'text-lime' : 'text-[#6E645C]'}>{selected.includes(product.id) ? '✓' : '+'}</span><span className="truncate">{product.name}</span><span className="ml-auto text-[#8A7F76]">{product.availableUnits} шт.</span></button>)}</div></div>}
      <div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Начало по расписанию"><input type="datetime-local" className={FIELD} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field><Field label="Окончание"><input type="datetime-local" className={FIELD} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field></div>
      <button type="button" disabled={busy || !form.title.trim() || (form.type === 'collection' && selected.length === 0)} onClick={create} className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-lime px-4 py-2.5 text-sm font-bold text-lime-ink disabled:opacity-40"><Send size={15} />{startsAt ? 'Создать и запланировать' : 'Создать черновик'}</button>
      {notice && <p className="mt-3 text-sm text-[#E5B23C]">{notice}</p>}
    </section>

    <section className="rounded-[8px] border border-[#2E2822] bg-[#1A1611] p-5">
      <h2 className="font-bold">Баннеры, подборки и порядок</h2>
      <p className="mt-1 text-xs text-[#8A7F76]">Опубликованные блоки меняют главную страницу без выпуска новой версии сайта.</p>
      <div className="mt-4 grid gap-2">
        {blocks.map((block) => {
          const active = blocks.filter((item) => item.status !== 'archived');
          const index = active.findIndex((item) => item.id === block.id);
          return <article key={block.id} className={`flex items-center gap-3 rounded-[8px] border p-3 ${block.status === 'archived' ? 'border-[#24201C] opacity-55' : 'border-[#2E2822] bg-[#221E19]'}`}>
            <div className={`grid h-11 w-20 shrink-0 place-items-center rounded-[7px] ${tone(block.tone)}`}>{block.imageUrl ? <ImageIcon size={17} /> : labelType(block.type).slice(0, 1)}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{block.title}</div><div className="mt-0.5 text-[11px] text-[#8A7F76]">{labelType(block.type)} · {labelDevice(block.device)} · {labelStatus(block)}</div>{block.type === 'collection' && <div className="mt-0.5 truncate text-[11px] text-[#A79C92]">{block.productIds.map((id) => byId.get(id)?.name ?? id).join(', ')}</div>}</div>
            {block.status !== 'archived' && <div className="flex shrink-0 gap-1"><Icon title="Выше" disabled={index <= 0 || busy} onClick={() => move(index, -1)}><ArrowUp size={14} /></Icon><Icon title="Ниже" disabled={index < 0 || index === active.length - 1 || busy} onClick={() => move(index, 1)}><ArrowDown size={14} /></Icon></div>}
            <div className="flex shrink-0 flex-wrap justify-end gap-1">{block.status === 'draft' && <button disabled={busy} onClick={() => run(() => publishStorefrontBlock(block.id, accessToken), 'Блок опубликован')} className="rounded-[6px] bg-coral px-2.5 py-1.5 text-[11px] font-bold text-white">Включить</button>}{block.status === 'scheduled' && <button disabled={busy} onClick={() => run(() => cancelStorefrontBlockSchedule(block.id, accessToken), 'Расписание отменено')} className="rounded-[6px] border border-[#E5B23C] px-2 py-1.5 text-[11px] text-[#E5B23C]"><CalendarClock size={13} /></button>}{block.status === 'published' && <button disabled={busy} onClick={() => run(() => archiveStorefrontBlock(block.id, accessToken), 'Блок выключен и помещён в архив')} className="rounded-[6px] border border-[#3A342E] px-2 py-1.5 text-[11px] text-[#A79C92]"><Archive size={13} /></button>}</div>
          </article>;
        })}
        {blocks.length === 0 && <div className="rounded-[8px] border border-dashed border-[#3A342E] py-10 text-center text-sm text-[#8A7F76]">Добавьте первый баннер или подборку</div>}
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs text-[#A79C92]"><span>{label}</span>{children}</label>; }
function Icon({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-[6px] text-[#A79C92] hover:bg-[#2E2822] disabled:opacity-30">{children}</button>; }
function labelType(type: StorefrontBlockType) { return ({ hero: 'Главный баннер', promo: 'Промо-блок', info: 'Инфо-блок', collection: 'Подборка' })[type]; }
function labelDevice(device: StorefrontBlockDevice) { return device === 'all' ? 'все устройства' : device; }
function labelStatus(block: StorefrontBlock) { if (block.status === 'scheduled') return `с ${new Date(block.startsAt!).toLocaleString('ru-RU')}`; return ({ draft: 'черновик', published: 'включён', archived: 'архив' })[block.status]; }
function tone(value: StorefrontBlock['tone']) { return value === 'coral' ? 'bg-coral text-white' : value === 'light' ? 'bg-white text-black' : value === 'lime' ? 'bg-lime text-lime-ink' : 'bg-[#0E0C0A] text-[#A79C92]'; }
