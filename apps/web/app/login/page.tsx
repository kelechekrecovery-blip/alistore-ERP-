'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { requestOtp, verifyOtp, requestRecoveryOtp, verifyRecoveryOtp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/account';

  const [stepCode, setStepCode] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  async function send(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!phoneValid) return setError('Введите корректный номер.');
    setBusy(true);
    try {
      const { devCode: dc } = recovery
        ? await requestRecoveryOtp(phone.trim())
        : await requestOtp(phone.trim());
      setDevCode(dc ?? null);
      if (dc) setCode(dc);
      setStepCode(true);
    }
    catch { setError('Не удалось отправить код.'); } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      if (recovery) await verifyRecoveryOtp(phone.trim(), code.trim());
      else await verifyOtp(phone.trim(), code.trim());
      router.push(next);
    }
    catch { setError(recovery ? 'Аккаунт не найден или код просрочен.' : 'Неверный или просроченный код.'); } finally { setBusy(false); }
  }

  function switchMode(nextRecovery: boolean) {
    setRecovery(nextRecovery);
    setStepCode(false);
    setCode('');
    setDevCode(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col justify-center bg-[#16130F] px-7 text-white">
        <div className="grid h-[60px] w-[60px] place-items-center rounded-[17px] bg-coral font-display text-3xl font-extrabold">A</div>
        <div className="mt-6 font-display text-3xl font-extrabold leading-none">
          {recovery ? 'Восстановление доступа' : 'Вход в AliStore'}
        </div>
        <div className="mt-2.5 text-sm leading-relaxed text-[#A79C92]">
          {stepCode
            ? `Код отправлен на ${phone}`
            : recovery
              ? 'Введите номер аккаунта — после проверки старые сессии будут отозваны.'
              : 'Техника с гарантией и trade-in. Войдите по номеру — быстро и безопасно.'}
        </div>

        {!stepCode ? (
          <form onSubmit={send} className="mt-6">
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-[13px] bg-[#221E19] p-1">
              <button
                type="button"
                onClick={() => switchMode(false)}
                className={`rounded-[10px] px-3 py-2 text-sm font-bold ${!recovery ? 'bg-lime text-lime-ink' : 'text-[#A79C92]'}`}
              >
                Войти
              </button>
              <button
                type="button"
                onClick={() => switchMode(true)}
                className={`rounded-[10px] px-3 py-2 text-sm font-bold ${recovery ? 'bg-lime text-lime-ink' : 'text-[#A79C92]'}`}
              >
                Восстановить
              </button>
            </div>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5 font-mono text-[15px] text-white outline-none focus:border-lime" autoFocus />
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="submit" disabled={busy} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:opacity-60">{busy ? 'Отправляем…' : recovery ? 'Получить код восстановления' : 'Получить код по SMS'}</button>
            <div className="mt-3 flex gap-2.5">
              <button type="button" disabled className="flex-1 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3 text-center text-sm text-[#6E645C] opacity-70">Apple</button>
              <button type="button" disabled className="flex-1 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3 text-center text-sm text-[#6E645C] opacity-70">Telegram</button>
            </div>
            <button type="button" onClick={() => router.push('/')} className="mt-5 w-full text-center text-[13px] text-[#A79C92]">Продолжить как гость →</button>
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-6">
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-значный код" className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-lime" autoFocus />
            {devCode && <p className="mt-2 rounded-[10px] bg-[#221E19] px-3 py-2 text-center font-mono text-xs text-lime">dev-код: {devCode}</p>}
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">{busy ? 'Проверяем…' : recovery ? 'Восстановить доступ' : 'Войти'}</button>
            <button type="button" onClick={() => { setStepCode(false); setCode(''); setDevCode(null); }} className="mt-3 w-full text-center text-[13px] text-[#A79C92]">← Изменить номер</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="fixed inset-0 z-40 bg-[#16130F]" />}><LoginForm /></Suspense>;
}
