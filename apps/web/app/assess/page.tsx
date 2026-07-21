'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { assessUsed, type Valuation } from '@/lib/ai';
import { som } from '@/lib/format';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, restoreStaffSession, type StaffSession } from '@/lib/staff-session';

const GRADES: { id: 'A' | 'B' | 'C'; label: string }[] = [
  { id: 'A', label: 'A · как новый' },
  { id: 'B', label: 'B · следы' },
  { id: 'C', label: 'C · заметный износ' },
];
const DEFECTS: { id: string; label: string }[] = [
  { id: 'screen', label: 'Экран' },
  { id: 'battery', label: 'Батарея' },
  { id: 'body', label: 'Корпус' },
  { id: 'water', label: 'Влага' },
  { id: 'camera', label: 'Камера' },
];

export default function AssessPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [sku, setSku] = useState('');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('B');
  const [ageMonths, setAgeMonths] = useState('8');
  const [defects, setDefects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Valuation | null>(null);
  const [err, setErr] = useState('');
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    void restoreStaffSession().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchCatalog({ limit: 100 }).then((c) => {
      setProducts(c.items);
      if (c.items[0]) setSku(c.items[0].sku);
    });
  }, [session]);

  function toggleDefect(id: string) {
    setDefects((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function assess() {
    if (!sku) return;
    setBusy(true); setErr('');
    try {
      if (!session) throw new Error('Нужен вход сотрудника');
      setResult(await assessUsed({ sku, grade, ageMonths: Number(ageMonths) || 0, defects }, session.accessToken));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка оценки');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-night p-4">
        <Link
          href="/staff"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Сотрудник
        </Link>
        <StaffSessionLogin
          title="Оценка Б/У · вход"
          caption="Войдите staff-аккаунтом, чтобы запускать AI-оценку."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night font-sans text-white">
      <header className="flex items-center gap-4 border-b border-surface-3 bg-ink-dark px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime font-display text-lg font-extrabold text-lime-ink">₸</span>
        <div>
          <div className="font-display text-lg font-bold">Оценка Б/У</div>
          <div className="text-xs text-subtle">AI-рекомендация выкупа и перепродажи · правила депрециации</div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
          }}
          className="ml-auto rounded-chip bg-surface-2 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          Выйти staff
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-[860px] gap-4 lg:grid-cols-2">
          {/* form */}
          <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle">Модель</label>
            <select value={sku} onChange={(e) => setSku(e.target.value)} className="mb-4 w-full rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:border-lime">
              {products.map((p) => <option key={p.id} value={p.sku}>{p.name} · нов. {som(p.price)}</option>)}
            </select>

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle">Состояние</label>
            <div className="mb-4 flex flex-col gap-1.5">
              {GRADES.map((g) => (
                <button key={g.id} type="button" onClick={() => setGrade(g.id)} className={`rounded-[10px] border px-3 py-2 text-left text-sm transition ${grade === g.id ? 'border-lime bg-lime/10 text-lime' : 'border-surface-3 bg-surface-2 text-bright'}`}>{g.label}</button>
              ))}
            </div>

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle">Возраст (мес)</label>
            <input value={ageMonths} onChange={(e) => setAgeMonths(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mb-4 w-28 rounded-[10px] border border-surface-3 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none placeholder:text-faint focus:border-lime" />

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-subtle">Дефекты</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {DEFECTS.map((d) => (
                <button key={d.id} type="button" onClick={() => toggleDefect(d.id)} className={`rounded-chip border px-3 py-1.5 text-[12px] font-semibold transition ${defects.includes(d.id) ? 'border-coral bg-coral/15 text-danger-soft' : 'border-surface-3 bg-surface-2 text-muted'}`}>{d.label}</button>
              ))}
            </div>

            <button type="button" disabled={busy || !sku} onClick={assess} className="w-full rounded-[12px] bg-lime py-3 text-[15px] font-bold text-lime-ink disabled:bg-line disabled:text-faint">{busy ? 'Считаем…' : 'Оценить'}</button>
            {err && <div className="mt-3 rounded-[10px] border border-danger-soft/30 bg-danger-soft/5 p-2.5 text-sm text-danger-soft">{err}</div>}
          </div>

          {/* result */}
          <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[12px] border border-surface-3 bg-surface-2 p-4">
                    <div className="text-[11px] text-subtle">Выкуп (платим клиенту)</div>
                    <div className="mt-1 font-display text-2xl font-extrabold text-lime">{som(result.buyback)}</div>
                  </div>
                  <div className="rounded-[12px] border border-surface-3 bg-surface-2 p-4">
                    <div className="text-[11px] text-subtle">Перепродажа</div>
                    <div className="mt-1 font-display text-2xl font-extrabold">{som(result.resale)}</div>
                  </div>
                </div>
                <div className="mt-3 flex justify-between border-b border-surface-2 py-2 text-[13px]">
                  <span className="text-muted">Новая цена</span>
                  <span className="font-mono">{som(result.basePrice)}</span>
                </div>
                <div className="flex justify-between border-b border-surface-2 py-2 text-[13px]">
                  <span className="text-muted">Сохранил стоимости</span>
                  <span className="font-mono text-lime">{result.retainedPct}%</span>
                </div>
                <div className="flex justify-between py-2 text-[13px]">
                  <span className="text-muted">Факторы (возраст·сорт·дефекты)</span>
                  <span className="font-mono text-subtle">×{result.factors.age} · ×{result.factors.grade} · −{Math.round(result.factors.defect * 100)}%</span>
                </div>
                {result.notes.length > 0 && (
                  <div className="mt-3 rounded-[12px] border border-surface-3 bg-surface-2 p-3">
                    {result.notes.map((n) => <div key={n} className="py-0.5 text-[12px] text-muted">💡 {n}</div>)}
                  </div>
                )}
                <div className="mt-3 text-[11px] text-faint">Рекомендация — правила депрециации. При ключе LLM/vision — оценка по фото и рынку.</div>
              </>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm text-subtle">Заполните параметры и нажмите «Оценить».</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
