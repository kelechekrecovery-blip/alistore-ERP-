'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { requestOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/account';

  const [stepCode, setStepCode] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!phoneValid) return setError('Введите корректный номер.');
    setBusy(true);
    try { const { devCode: dc } = await requestOtp(phone.trim()); setDevCode(dc ?? null); if (dc) setCode(dc); setStepCode(true); }
    catch { setError('Не удалось отправить код.'); } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try { await verifyOtp(phone.trim(), code.trim()); router.push(next); }
    catch { setError('Неверный или просроченный код.'); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col justify-center bg-[#16130F] px-7 text-white">
        <div className="grid h-[60px] w-[60px] place-items-center rounded-[17px] bg-coral font-display text-3xl font-extrabold">A</div>
        <div className="mt-6 font-display text-3xl font-extrabold leading-none">Вход в AliStore</div>
        <div className="mt-2.5 text-sm leading-relaxed text-[#A79C92]">
          {stepCode ? `Код отправлен на ${phone}` : 'Техника с гарантией и trade-in. Войдите по номеру — быстро и безопасно.'}
        </div>

        {!stepCode ? (
          <form onSubmit={send} className="mt-6">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5 font-mono text-[15px] text-white outline-none focus:border-lime" autoFocus />
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="submit" disabled={busy} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:opacity-60">{busy ? 'Отправляем…' : 'Получить код по SMS'}</button>
            <div className="mt-3 flex gap-2.5">
              <div className="flex-1 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3 text-center text-sm text-[#8A7F76]"> Apple</div>
              <div className="flex-1 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3 text-center text-sm text-[#8A7F76]">✈ Telegram</div>
            </div>
            <button type="button" onClick={() => router.push('/')} className="mt-5 w-full text-center text-[13px] text-[#A79C92]">Продолжить как гость →</button>
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-6">
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-значный код" className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-lime" autoFocus />
            {devCode && <p className="mt-2 rounded-[10px] bg-[#221E19] px-3 py-2 text-center font-mono text-xs text-lime">dev-код: {devCode}</p>}
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">{busy ? 'Проверяем…' : 'Войти'}</button>
            <button type="button" onClick={() => { setStepCode(false); setCode(''); }} className="mt-3 w-full text-center text-[13px] text-[#A79C92]">← Изменить номер</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="fixed inset-0 z-40 bg-[#16130F]" />}><LoginForm /></Suspense>;
}
