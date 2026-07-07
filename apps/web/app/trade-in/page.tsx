'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { createCustomer, createTradeIn, type TradeIn, type TradeInGrade } from '@/lib/api';
import { som } from '@/lib/format';

const grades: { id: TradeInGrade; label: string; desc: string; factor: number }[] = [
  { id: 'A', label: 'Отличное', desc: 'без царапин, как новый', factor: 1 },
  { id: 'B', label: 'Хорошее', desc: 'мелкие потёртости', factor: 0.82 },
  { id: 'C', label: 'Удовлетворительное', desc: 'заметный износ, нужна диагностика', factor: 0.62 },
];

function basePrice(model: string) {
  const value = model.toLowerCase();
  if (value.includes('iphone 15')) return 65000;
  if (value.includes('iphone 14')) return 52000;
  if (value.includes('iphone 13')) return 38000;
  if (value.includes('iphone 12')) return 28000;
  if (value.includes('macbook')) return 70000;
  if (value.includes('ipad')) return 32000;
  if (value.includes('airpods')) return 8000;
  return 30000;
}

export default function TradeInPage() {
  const { user } = useAuth();
  const [model, setModel] = useState('iPhone 13 · 128 ГБ');
  const [grade, setGrade] = useState<TradeInGrade>('B');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [passport, setPassport] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TradeIn | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (user?.phone) setPhone((p) => p || user.phone); }, [user?.phone]);

  const selectedGrade = grades.find((g) => g.id === grade) ?? grades[1];
  const price = useMemo(() => Math.round((basePrice(model) * selectedGrade.factor) / 500) * 500, [model, selectedGrade.factor]);
  const range = `${som(Math.max(price - 2000, 1000))}–${som(price + 2000)}`;

  async function submit() {
    if (!model.trim() || !passport.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const customerId = user?.customerId ?? (await createCustomer({ phone: phone.trim(), name: name.trim() || undefined })).id;
      const tradeIn = await createTradeIn({
        customerId,
        model: note.trim() ? `${model.trim()} (${note.trim()})` : model.trim(),
        grade,
        price,
        sellerPassport: passport.trim(),
        actor: 'customer_app',
      });
      setDone(tradeIn);
    } catch {
      setError('Не удалось оформить trade-in. Проверьте телефон и документ.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <MobileAppFrame title="Trade-in оценка" subtitle="Заявка создана, договор доступен сотруднику." active="home" backHref="/account">
        <div className="rounded-[18px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-5 text-center">
          <div className="text-[13px] text-[#A79C92]">Предварительная оценка</div>
          <div className="mt-2 font-display text-[34px] font-extrabold leading-none text-lime">{som(done.price)}</div>
          <div className="mt-2 font-mono text-[12px] text-[#8A7F76]">{done.contractId}</div>
          <div className="mt-2 text-[12px] leading-relaxed text-[#8A7F76]">Паспорт сохранён в защищённом виде: {done.sellerPassportMasked}</div>
        </div>
        <Link href="/" className="mt-4 block rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink">Выбрать новое устройство</Link>
        <button type="button" onClick={() => setDone(null)} className="mt-3 w-full text-center text-[13px] text-[#A79C92]">Оценить другое</button>
      </MobileAppFrame>
    );
  }

  return (
    <MobileAppFrame title="Trade-in оценка" subtitle="Оцените старое устройство за 30 секунд и зачтите сумму в новую покупку." active="home" backHref="/account">
      <div className="rounded-[18px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-5 text-center">
        <div className="text-[13px] text-[#A79C92]">Ориентир по текущим данным</div>
        <div className="mt-2 font-display text-[30px] font-extrabold leading-none text-lime">{range}</div>
        <div className="mt-2 text-[12px] leading-relaxed text-[#8A7F76]">Точная цена после диагностики. Можно получить выплату или скидку на новый товар.</div>
      </div>

      <div className="mt-4 text-[13px] text-[#A79C92]">Модель</div>
      <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-2 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-sm outline-none focus:border-lime" />

      <div className="mb-2 mt-4 text-[13px] text-[#A79C92]">Состояние</div>
      {grades.map((g) => (
        <button key={g.id} type="button" onClick={() => setGrade(g.id)} className={`mb-2 flex w-full items-center gap-2.5 rounded-[11px] border bg-[#221E19] p-3 text-left ${grade === g.id ? 'border-lime' : 'border-[#2E2822]'}`}>
          <span className={`h-[18px] w-[18px] rounded-full border-2 ${grade === g.id ? 'border-lime bg-lime' : 'border-[#3A342E]'}`} />
          <span>
            <span className="block text-[13px] font-semibold">{g.label}</span>
            <span className="mt-0.5 block text-[11px] text-[#8A7F76]">{g.desc}</span>
          </span>
        </button>
      ))}

      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Память, батарея, комплект, дефекты" className="mt-1 min-h-[76px] w-full rounded-[12px] border border-dashed border-[#3A342E] bg-[#221E19] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />

      {!user && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 font-mono text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя продавца" className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
        </div>
      )}
      <input value={passport} onChange={(e) => setPassport(e.target.value)} placeholder="Паспорт / ID для договора" className="mt-2 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
      {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
      <button type="button" disabled={busy || !model.trim() || !passport.trim() || (!user && phone.trim().length < 9)} onClick={submit} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">{busy ? 'Оформляем…' : 'Зафиксировать оценку'}</button>
    </MobileAppFrame>
  );
}
