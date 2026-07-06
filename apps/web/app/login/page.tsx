'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { requestOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/account';

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phoneValid) return setError('Введите корректный номер телефона.');
    setBusy(true);
    try {
      const { devCode: dc } = await requestOtp(phone.trim());
      setDevCode(dc ?? null);
      if (dc) setCode(dc); // dev convenience
      setStep('code');
    } catch {
      setError('Не удалось отправить код. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyOtp(phone.trim(), code.trim());
      router.push(next);
    } catch {
      setError('Неверный или просроченный код.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-16">
      <div className="mx-auto max-w-md rounded-card border border-ink/10 bg-white p-8 shadow-soft">
        <h1 className="font-display text-2xl font-extrabold text-ink">Вход в кабинет</h1>
        <p className="mt-1 text-sm text-ink/55">
          {step === 'phone'
            ? 'Введите номер — пришлём код подтверждения.'
            : `Код отправлен на ${phone}`}
        </p>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="mt-6 flex flex-col gap-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+996 700 123 456"
              aria-label="Телефон"
              className="input"
              autoFocus
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-btn bg-coral py-3 text-base font-semibold text-white transition hover:bg-deep disabled:bg-ink/20"
            >
              {busy ? 'Отправляем…' : 'Получить код'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-6 flex flex-col gap-4">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-значный код"
              aria-label="Код из СМС"
              className="input text-center font-mono text-lg tracking-[0.4em]"
              autoFocus
            />
            {devCode && (
              <p className="rounded-btn bg-tint px-3 py-2 text-center font-mono text-xs text-deep">
                dev-код: {devCode}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded-btn bg-coral py-3 text-base font-semibold text-white transition hover:bg-deep disabled:bg-ink/20"
            >
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
              className="text-sm text-ink/55 transition hover:text-ink"
            >
              ← Изменить номер
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="py-24 text-center font-mono text-sm text-ink/40">Загрузка…</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
