'use client';

import { Mail, Phone } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/locale';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { describeAuthError } from '@/lib/auth-errors';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type Channel = 'phone' | 'email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('996')) {
    return '+' + digits.slice(0, 12);
  }
  if (digits.startsWith('0')) {
    return '+996' + digits.slice(1, 10);
  }
  return '+996' + digits.slice(0, 9);
}

function LoginForm() {
  const emailLoginEnabled =
    process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_AUTH_EMAIL_LOGIN_ENABLED === 'true';
  const {
    requestOtp,
    verifyOtp,
    requestEmailOtp,
    verifyEmailOtp,
    telegramLogin,
    completeSocialEnrollment,
  } = useAuth();
  const router = useRouter();
  const { locale, t } = useT();
  const params = useSearchParams();
  const requestedNext = params.get('next');
  const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/account';

  const [channel, setChannel] = useState<Channel>('phone');
  const [stepCode, setStepCode] = useState(false);
  const [phone, setPhone] = useState('+996');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [telegramInitData, setTelegramInitData] = useState('');
  const [telegramEnrollmentToken, setTelegramEnrollmentToken] = useState<string | null>(null);
  const telegramEnrollmentActive = telegramEnrollmentToken !== null;
  const phoneValid = /^\+996\d{9}$/.test(phone.trim());
  const emailValid = EMAIL_RE.test(email.trim());
  const identity = channel === 'email' ? email.trim() : phone.trim();

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.initData) {
      webApp.ready?.();
      setTelegramInitData(webApp.initData);
    }
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const copy = locale === 'ru'
    ? {
        title: telegramEnrollmentActive ? 'Подтвердите номер телефона' : 'Войти или создать аккаунт',
        phoneSubtitle: telegramEnrollmentActive
          ? 'Telegram подтверждён. Введите номер телефона — мы привяжем Telegram только после проверки SMS-кода.'
          : 'Если номер ещё не зарегистрирован, после проверки кода мы создадим аккаунт.',
        emailSubtitle: 'Войдите по привязанной почте — код придёт на адрес, уже добавленный в аккаунт.',
        phoneLabel: 'Номер телефона',
        emailLabel: 'Email — привязанная почта',
        codeLabel: channel === 'email' ? 'Код из письма' : 'Код из SMS',
        confirm: telegramEnrollmentActive ? 'Подтвердить номер и войти' : 'Войти или создать аккаунт',
        resend: 'Отправить код ещё раз',
        sent: `Код отправлен на ${identity}`,
      }
    : {
        title: telegramEnrollmentActive ? 'Телефон номерин ырастаңыз' : 'Кирүү же аккаунт түзүү',
        phoneSubtitle: telegramEnrollmentActive
          ? 'Telegram ырасталды. Телефон номерин киргизиңиз — SMS код текшерилгенден кийин гана Telegram байланыштырылат.'
          : 'Эгер номер каттала элек болсо, код текшерилгенден кийин аккаунт түзөбүз.',
        emailSubtitle: 'Байланган почта менен кириңиз — код аккаунтка кошулган дарекке келет.',
        phoneLabel: 'Телефон номери',
        emailLabel: 'Email — байланган почта',
        codeLabel: channel === 'email' ? 'Каттагы код' : 'SMS коду',
        confirm: telegramEnrollmentActive ? 'Номерди ырастап кирүү' : 'Кирүү же аккаунт түзүү',
        resend: 'Кодду кайра жөнөтүү',
        sent: `Код ${identity} дарегине жөнөтүлдү`,
      };

  async function requestCode() {
    if (busy) return;
    setError(null);
    setStatus(null);
    if (channel === 'email' && !emailValid) {
      setError('Введите корректный email.');
      return;
    }
    if (channel === 'phone' && !phoneValid) {
      setError('Введите корректный номер.');
      return;
    }
    setBusy(true);
    try {
      const challenge = channel === 'email'
        ? await requestEmailOtp(email.trim())
        : await requestOtp(phone.trim());
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? null);
      if (challenge.devCode) setCode(challenge.devCode);
      setStepCode(true);
      setResendSeconds(60);
      setStatus(copy.sent);
    } catch (err) {
      setError(channel === 'email'
        ? describeAuthError(err, 'Не удалось отправить код.')
        : 'Не удалось отправить код.');
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await requestCode();
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      if (telegramEnrollmentToken) {
        await completeSocialEnrollment(
          telegramEnrollmentToken,
          phone.trim(),
          code.trim(),
          challengeId ?? undefined,
        );
        setTelegramEnrollmentToken(null);
      } else if (channel === 'email') await verifyEmailOtp(email.trim(), code.trim(), challengeId ?? undefined);
      else await verifyOtp(phone.trim(), code.trim(), challengeId ?? undefined);
      router.push(next);
    }
    catch (err) {
      if (channel === 'email') setError(describeAuthError(err, 'Неверный или просроченный код.'));
      else setError('Неверный или просроченный код.');
    } finally { setBusy(false); }
  }

  async function loginTelegram() {
    if (!telegramInitData || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await telegramLogin(telegramInitData, 'mini_app');
      if (result.status === 'authenticated') {
        setTelegramEnrollmentToken(null);
        router.push(next);
        return;
      }
      setTelegramEnrollmentToken(result.enrollmentToken);
      setChannel('phone');
      setStepCode(false);
      setPhone('+996');
      setCode('');
      setDevCode(null);
      setChallengeId(null);
      setResendSeconds(0);
      setStatus(null);
    } catch {
      setError('Не удалось войти через Telegram.');
    } finally {
      setBusy(false);
    }
  }

  function switchChannel(nextChannel: Channel) {
    setTelegramEnrollmentToken(null);
    setChannel(nextChannel);
    setStepCode(false);
    setCode('');
    setDevCode(null);
    setChallengeId(null);
    setResendSeconds(0);
    setError(null);
    setStatus(null);
  }

  function cancelTelegramEnrollment() {
    setTelegramEnrollmentToken(null);
    setStepCode(false);
    setPhone('+996');
    setCode('');
    setDevCode(null);
    setChallengeId(null);
    setResendSeconds(0);
    setError(null);
    setStatus(null);
  }

  return (
    <div className="login-shell min-h-screen bg-ink-dark font-sans text-white">
      <SiteHeader variant="design3" />
      <main className="mx-auto grid min-h-[680px] w-[min(1200px,92vw)] place-items-center py-12">
      <div className="login-panel w-full max-w-[560px] rounded-[24px] border border-white/[0.11] bg-[radial-gradient(circle_at_100%_0%,rgba(249,115,22,.15),transparent_45%),rgba(255,255,255,.035)] px-7 py-9 shadow-[0_30px_90px_-60px_rgba(249,115,22,.7)] sm:px-10 sm:py-11">
        <div className="flex items-start justify-between">
          <div className="grid h-[60px] w-[60px] place-items-center rounded-[17px] bg-coral font-display text-3xl font-extrabold">A</div>
          <LanguageToggle />
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold leading-none">
          {copy.title}
        </h1>
        <div className="mt-2.5 text-sm leading-relaxed text-muted">
          {stepCode
            ? copy.sent
            : channel === 'email'
              ? copy.emailSubtitle
              : copy.phoneSubtitle}
        </div>

        {!stepCode && !telegramEnrollmentActive && (
          <div
            aria-label="Способ входа"
            className={`login-channels mt-6 grid gap-2 rounded-[13px] border border-white/[0.08] bg-black/20 p-1 ${emailLoginEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            <button
              type="button"
              aria-pressed={channel === 'phone'}
              data-testid="login-channel-phone"
              onClick={() => switchChannel('phone')}
              className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2.5 text-sm font-bold transition-colors ${channel === 'phone' ? 'bg-coral text-white' : 'text-muted hover:text-white'}`}
            >
              <Phone size={15} /> {t('login.channel.phone')}
            </button>
            {emailLoginEnabled && (
              <button
                type="button"
                aria-pressed={channel === 'email'}
                data-testid="login-channel-email"
                onClick={() => switchChannel('email')}
                className={`flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2.5 text-sm font-bold transition-colors ${channel === 'email' ? 'bg-coral text-white' : 'text-muted hover:text-white'}`}
              >
                <Mail size={15} /> {t('login.channel.email')}
              </button>
            )}
          </div>
        )}

        {!stepCode ? (
          <form onSubmit={send} className="mt-3">
            {channel === 'phone' ? (
              <label className="block text-sm font-semibold text-white">
                {copy.phoneLabel}
                <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(normalizePhone(e.target.value))} placeholder="+996 555 000 000" className="login-field mt-2 w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3.5 font-mono text-[15px] text-white outline-none focus:border-lime" autoFocus />
              </label>
            ) : (
              <label className="block text-sm font-semibold text-white">
                {copy.emailLabel}
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="login-field mt-2 w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3.5 text-[15px] text-white outline-none focus:border-lime" autoFocus />
              </label>
            )}
            {error && <p role="alert" aria-live="assertive" className="mt-2 text-sm text-danger-soft">{error}</p>}
            <button type="submit" disabled={busy} className="mt-3 w-full rounded-[13px] bg-coral py-3.5 text-center text-[15px] font-bold text-white disabled:opacity-60">
              {busy ? t('login.cta.sending') : channel === 'email' ? t('login.cta.email') : t('login.cta.sms')}
            </button>
            {channel === 'phone' && telegramInitData && !telegramEnrollmentActive && (
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={loginTelegram}
                  disabled={busy}
                  className="w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3 text-center text-sm font-semibold text-white disabled:text-faint disabled:opacity-70"
                >
                  Telegram
                </button>
              </div>
            )}
            {telegramEnrollmentActive && (
              <button
                type="button"
                onClick={cancelTelegramEnrollment}
                className="mt-3 w-full text-center text-[13px] text-muted"
              >
                Отменить вход через Telegram
              </button>
            )}
            <button type="button" onClick={() => router.push('/')} className="mt-5 w-full text-center text-[13px] text-muted">{t('login.guest')}</button>
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-3">
            <label className="block text-sm font-semibold text-white">
              {copy.codeLabel}
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('login.code.placeholder')} className="login-field mt-2 w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3.5 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-lime" autoFocus />
            </label>
            {devCode && <p className="mt-2 rounded-[10px] bg-surface-2 px-3 py-2 text-center font-mono text-xs text-lime">dev-код: {devCode}</p>}
            {status && <p aria-live="polite" className="mt-2 text-center text-sm text-muted">{status}</p>}
            {error && <p role="alert" aria-live="assertive" className="mt-2 text-sm text-danger-soft">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className="mt-3 w-full rounded-[13px] bg-coral py-3.5 text-center text-[15px] font-bold text-white disabled:bg-line disabled:text-faint">{busy ? t('login.code.checking') : copy.confirm}</button>
            <button type="button" onClick={requestCode} disabled={busy || resendSeconds > 0} className="mt-3 w-full text-center text-[13px] text-muted disabled:text-faint">
              {resendSeconds > 0 ? `${copy.resend} (${resendSeconds})` : copy.resend}
            </button>
            <button type="button" onClick={() => { setStepCode(false); setChallengeId(null); setResendSeconds(0); setDevCode(null); setError(null); setStatus(null); }} className="mt-3 w-full text-center text-[13px] text-muted">{channel === 'email' ? t('login.code.changeEmail') : t('login.code.changePhone')}</button>
            {telegramEnrollmentActive && (
              <button type="button" onClick={cancelTelegramEnrollment} className="mt-3 w-full text-center text-[13px] text-muted">
                Отменить вход через Telegram
              </button>
            )}
          </form>
        )}
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="fixed inset-0 z-40 bg-ink-dark" />}><LoginForm /></Suspense>;
}
