'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  suggestCategory,
  generateDescription,
  type CategorySuggestion,
  type ProductDescription,
} from '@/lib/ai';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

interface AttrRow {
  key: string;
  value: string;
}

const EMPTY_ROWS: AttrRow[] = [
  { key: '', value: '' },
  { key: '', value: '' },
];

/** Collapse the key/value rows into an attrs object, dropping blank keys. */
function toAttrs(rows: AttrRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, r) => {
    const key = r.key.trim();
    if (key) acc[key] = r.value.trim();
    return acc;
  }, {});
}

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#8A7F76]';
const inputCls =
  'w-full rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime';
const cardCls = 'rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5';
const errCls = 'mt-3 rounded-[10px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 p-2.5 text-sm text-[#FF8A7A]';

export default function AiToolsPage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<AttrRow[]>(EMPTY_ROWS);

  const [catBusy, setCatBusy] = useState(false);
  const [catErr, setCatErr] = useState('');
  const [cat, setCat] = useState<CategorySuggestion | null>(null);

  const [descBusy, setDescBusy] = useState(false);
  const [descErr, setDescErr] = useState('');
  const [desc, setDesc] = useState<ProductDescription | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  function setRow(i: number, patch: Partial<AttrRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function runCategorize() {
    if (!name.trim()) return;
    setCatBusy(true); setCatErr(''); setCat(null);
    try {
      if (!session) throw new Error('Нужен вход сотрудника');
      setCat(await suggestCategory({ name: name.trim(), attrs: toAttrs(rows) }, session.accessToken));
    } catch (e) {
      setCatErr(e instanceof Error ? e.message : 'Ошибка категоризации');
    } finally {
      setCatBusy(false);
    }
  }

  async function runDescribe() {
    if (!name.trim()) return;
    setDescBusy(true); setDescErr(''); setDesc(null);
    try {
      if (!session) throw new Error('Нужен вход сотрудника');
      setDesc(await generateDescription({
        name: name.trim(),
        category: category.trim() || undefined,
        attrs: toAttrs(rows),
      }, session.accessToken));
    } catch (e) {
      setDescErr(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setDescBusy(false);
    }
  }

  const isLlm = desc ? desc.source !== 'template' : false;

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4">
        <Link
          href="/staff"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Сотрудник
        </Link>
        <StaffSessionLogin
          title="AI-инструменты · вход"
          caption="Войдите staff-аккаунтом, чтобы запускать AI-инструменты каталога."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E0C0A] font-sans text-white">
      <header className="flex items-center gap-4 border-b border-[#2E2822] bg-[#16130F] px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime font-display text-lg font-extrabold text-lime-ink">✦</span>
        <div>
          <div className="font-display text-lg font-bold">AI-инструменты</div>
          <div className="text-xs text-[#8A7F76]">Категоризация и описание карточки · правила без ключа, LLM при ключе</div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
          }}
          className="ml-auto rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          Выйти staff
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-[860px] gap-4 lg:grid-cols-2">
          {/* form */}
          <div className={cardCls}>
            <label className={labelCls}>Название товара</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone 15 128GB" className={`${inputCls} mb-4`} />

            <label className={labelCls}>Категория (необязательно)</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Смартфоны" className={`${inputCls} mb-4`} />

            <label className={labelCls}>Атрибуты (необязательно)</label>
            <div className="mb-4 flex flex-col gap-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-1.5">
                  <input value={r.key} onChange={(e) => setRow(i, { key: e.target.value })} placeholder="память" className={inputCls} />
                  <input value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="128 ГБ" className={inputCls} />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button type="button" disabled={catBusy || !name.trim()} onClick={runCategorize} className="w-full rounded-[12px] bg-lime py-3 text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">{catBusy ? 'Определяем…' : 'Определить категорию'}</button>
              <button type="button" disabled={descBusy || !name.trim()} onClick={runDescribe} className="w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] py-3 text-[15px] font-bold text-white disabled:text-[#6E645C]">{descBusy ? 'Генерируем…' : 'Сгенерировать описание'}</button>
            </div>
            {catErr && <div className={errCls}>{catErr}</div>}
            {descErr && <div className={errCls}>{descErr}</div>}
          </div>

          {/* results */}
          <div className={cardCls}>
            {!cat && !desc ? (
              <div className="grid h-full min-h-[200px] place-items-center text-center text-sm text-[#8A7F76]">Введите товар и нажмите одну из кнопок.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {cat && (
                  <div>
                    <div className={labelCls}>Категория</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-extrabold text-lime">{cat.category}</span>
                      <span className="font-mono text-[13px] text-[#8A7F76]">увер. {Math.round(cat.confidence * 100)}%</span>
                    </div>
                    {cat.matched.length > 0 && (
                      <div className="mt-2 text-[12px] text-[#A79C92]">Совпало: {cat.matched.join(', ')}</div>
                    )}
                    {cat.alternatives.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {cat.alternatives.map((a) => (
                          <span key={a.category} className="rounded-chip border border-[#2E2822] bg-[#221E19] px-3 py-1.5 text-[12px] font-semibold text-[#A79C92]">{a.category} · {a.score}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {cat && desc && <div className="border-t border-[#221E19]" />}

                {desc && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={`${labelCls} mb-0`}>Описание</span>
                      <span className={`rounded-chip px-2 py-0.5 text-[11px] font-semibold ${isLlm ? 'bg-lime/15 text-lime' : 'bg-[#221E19] text-[#A79C92]'}`}>{isLlm ? 'LLM' : 'шаблон'}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#D8CFC6]">{desc.description}</p>
                    {desc.highlights.length > 0 && (
                      <div className="mt-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
                        {desc.highlights.map((h) => <div key={h} className="py-0.5 text-[12px] text-[#A79C92]">• {h}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-[860px] text-[11px] text-[#6E645C]">Правила работают без ключа. При настроенном ключе LLM описание генерирует модель — бейдж покажет источник.</p>
      </div>
    </div>
  );
}
