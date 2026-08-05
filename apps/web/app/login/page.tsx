'use client';

import { Mail, Phone } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/lib/i18n/locale';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { authMethods, type AuthMethodsView } from '@/lib/api/auth';
import { telegramWidgetInitData } from '@/lib/telegram-widget';
import { describeAuthError } from '@/lib/auth-errors';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { safeLoginNext } from '@/components/mobile/login-next';

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    /** Колбэк Telegram Login Widget: имя жёстко зашивается в `data-onauth`. */
    onAliStoreTelegramAuth?: (user: Record<string, unknown>) => void;
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
          nonce: string;
        }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; state?: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}

type Channel = 'phone' | 'email';
/**
 * `recover` — не второй способ входа, а отдельное намерение: подтвердив номер,
 * человек отзывает ВСЕ прежние refresh-сессии. Нужен тому, у кого угнали доступ.
 */
type Mode = 'login' | 'recover';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nonce для Sign in with Apple.
 *
 * В вебе Apple кладёт в claim `nonce` выданного identityToken ровно ту строку,
 * что передана в `AppleID.auth.init` — поэтому на сервер уходит она же, без
 * хэширования. (В нативном iOS схема другая: туда передаётся SHA-256, и в токен
 * попадает хэш.) Сервер сравнивает claim с присланным значением и без него
 * отвечает `apple_nonce_required`.
 */
function createAppleNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

function loadAppleSdk(): Promise<void> {
  if (typeof window === 'undefined' || window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/js/SignInWithApple.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('apple-sdk-load-failed'));
    document.head.appendChild(script);
  });
}

function LoginForm() {
  const {
    requestOtp,
    verifyOtp,
    requestEmailOtp,
    verifyEmailOtp,
    requestRecoveryOtp,
    verifyRecoveryOtp,
    telegramLogin,
    appleLogin,
    completeSocialEnrollment,
  } = useAuth();
  const router = useRouter();
  const { locale, t } = useT();
  const params = useSearchParams();
  const next = safeLoginNext(params.get('next'), '/account');

  const [channel, setChannel] = useState<Channel>('phone');
  const [mode, setMode] = useState<Mode>('login');
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
  const [socialEnrollmentToken, setSocialEnrollmentToken] = useState<string | null>(null);
  const [socialEnrollmentProvider, setSocialEnrollmentProvider] = useState<'telegram' | 'apple'>('telegram');
  const socialEnrollmentActive = socialEnrollmentToken !== null;
  // Способы входа приходят с сервера: собранный заранее бандл не знает, какие
  // каналы владелец включил в дашборде хостинга уже после сборки образа.
  const [methods, setMethods] = useState<AuthMethodsView | null>(null);
  const emailLoginEnabled = methods?.email.enabled ?? false;
  const appleClientId = methods?.apple.clientId ?? null;
  const appleEnabled = methods !== null && methods.apple.enabled && appleClientId !== null;
  const telegramEnabled = Boolean(methods?.telegram.enabled) && telegramInitData.length > 0;
  // Виджет — путь для обычного браузера, где Mini App не подписывает вход сам.
  // Внутри Mini App он не нужен: там уже есть подписанный initData.
  const telegramBotUsername = methods?.telegram.botUsername ?? null;
  const telegramWidgetEnabled = Boolean(methods?.telegram.enabled)
    && telegramBotUsername !== null
    && telegramInitData.length === 0;
  // Пока ответа нет — форма телефона на месте: мигать заглушкой на каждой
  // загрузке хуже, чем на секунду показать основной путь.
  const phoneLoginEnabled = methods?.phone.enabled ?? true;
  // API-wide `enabled` may describe a native-only method. The website needs
  // the public Apple Services ID or Telegram Mini App/widget material too.
  const webLoginAvailable = phoneLoginEnabled
    || emailLoginEnabled
    || appleEnabled
    || telegramEnabled
    || telegramWidgetEnabled;
  const nothingAvailable = methods !== null && !webLoginAvailable;
  // Восстановление ходит тем же SMS-каналом и живёт под своим rollout-флагом:
  // сервер уже свёл оба условия в одно поле.
  const recoveryEnabled = Boolean(methods?.recovery.enabled);
  const recovering = mode === 'recover';
  const phoneValid = /^\+996\d{9}$/.test(phone.trim());
  const emailValid = EMAIL_RE.test(email.trim());
  const identity = channel === 'email' ? email.trim() : phone.trim();
  const socialProviderLabel = socialEnrollmentProvider === 'apple' ? 'Apple' : 'Telegram';

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.initData) {
      webApp.ready?.();
      setTelegramInitData(webApp.initData);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    authMethods()
      .then((available) => {
        if (cancelled) return;
        setMethods(available);
        // Экран открывается на телефоне, но если именно этот канал выключен, а
        // почта жива — начинаем с почты. Иначе человек упирается в заблокированную
        // кнопку и должен сам догадаться переключить вкладку.
        if (!available.phone.enabled && available.email.enabled) setChannel('email');
      })
      // Недоступный справочник не должен запирать дверь: оставляем основной
      // путь по телефону, а реальную причину покажет сам запрос кода.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Обработчик держим в ref и обновляем каждый рендер: скрипт виджета
  // вставляется один раз и зовёт глобальную функцию по имени, а замыкание,
  // захваченное при вставке, к моменту клика уже устарело бы.
  const telegramWidgetHandler = useRef<(user: Record<string, unknown>) => void>(() => undefined);
  useEffect(() => {
    telegramWidgetHandler.current = (user) => { void loginTelegramWidget(user); };
  });

  const telegramWidgetSlot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slot = telegramWidgetSlot.current;
    if (!telegramWidgetEnabled || !telegramBotUsername || !slot) return;
    window.onAliStoreTelegramAuth = (user) => telegramWidgetHandler.current(user);
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', telegramBotUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'onAliStoreTelegramAuth(user)');
    slot.appendChild(script);
    return () => {
      slot.replaceChildren();
      delete window.onAliStoreTelegramAuth;
    };
  }, [telegramWidgetEnabled, telegramBotUsername]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const baseCopy = locale === 'ru'
    ? {
        title: socialEnrollmentActive ? 'Подтвердите номер телефона' : 'Войти или создать аккаунт',
        phoneSubtitle: socialEnrollmentActive
          ? `${socialProviderLabel} подтверждён. Введите номер телефона — мы привяжем ${socialProviderLabel} только после проверки SMS-кода.`
          : 'Если номер ещё не зарегистрирован, после проверки кода мы создадим аккаунт.',
        emailSubtitle: 'Войдите по привязанной почте — код придёт на адрес, уже добавленный в аккаунт.',
        phoneLabel: 'Номер телефона',
        emailLabel: 'Email — привязанная почта',
        codeLabel: channel === 'email' ? 'Код из письма' : 'Код из SMS',
        confirm: socialEnrollmentActive ? 'Подтвердить номер и войти' : 'Войти или создать аккаунт',
        resend: 'Отправить код ещё раз',
        sent: `Код отправлен на ${identity}`,
      }
    : {
        title: socialEnrollmentActive ? 'Телефон номерин ырастаңыз' : 'Кирүү же аккаунт түзүү',
        phoneSubtitle: socialEnrollmentActive
          ? `${socialProviderLabel} ырасталды. Телефон номерин киргизиңиз — SMS код текшерилгенден кийин гана ${socialProviderLabel} байланыштырылат.`
          : 'Эгер номер каттала элек болсо, код текшерилгенден кийин аккаунт түзөбүз.',
        emailSubtitle: 'Байланган почта менен кириңиз — код аккаунтка кошулган дарекке келет.',
        phoneLabel: 'Телефон номери',
        emailLabel: 'Email — байланган почта',
        codeLabel: channel === 'email' ? 'Каттагы код' : 'SMS коду',
        confirm: socialEnrollmentActive ? 'Номерди ырастап кирүү' : 'Кирүү же аккаунт түзүү',
        resend: 'Кодду кайра жөнөтүү',
        sent: `Код ${identity} дарегине жөнөтүлдү`,
      };

  // Тексты восстановления уже переведены на оба языка — берём готовые ключи,
  // а не пишем вторую копию строк рядом со словарём.
  const copy = recovering
    ? {
        ...baseCopy,
        title: t('login.title.recovery'),
        phoneSubtitle: t('login.subtitle.recovery'),
        confirm: t('login.code.recover'),
      }
    : baseCopy;

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
        : recovering
          ? await requestRecoveryOtp(phone.trim())
          : await requestOtp(phone.trim());
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? null);
      if (challenge.devCode) setCode(challenge.devCode);
      setStepCode(true);
      setResendSeconds(60);
      setStatus(copy.sent);
    } catch (err) {
      // Machine-readable gateway errors contain no phone or credentials and
      // let the customer distinguish an offline gateway from invalid input.
      setError(describeAuthError(err, 'Не удалось отправить код.'));
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
      if (socialEnrollmentToken) {
        await completeSocialEnrollment(
          socialEnrollmentToken,
          phone.trim(),
          code.trim(),
          challengeId ?? undefined,
        );
        setSocialEnrollmentToken(null);
      } else if (channel === 'email') await verifyEmailOtp(email.trim(), code.trim(), challengeId ?? undefined);
      else if (recovering) await verifyRecoveryOtp(phone.trim(), code.trim(), challengeId ?? undefined);
      else await verifyOtp(phone.trim(), code.trim(), challengeId ?? undefined);
      router.push(next);
    }
    catch (err) {
      if (channel === 'email') setError(describeAuthError(err, 'Неверный или просроченный код.'));
      else setError('Неверный или просроченный код.');
    } finally { setBusy(false); }
  }

  async function loginTelegramWidget(user: Record<string, unknown>) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await telegramLogin(telegramWidgetInitData(user), 'login_widget');
      if (result.status === 'authenticated') {
        setSocialEnrollmentToken(null);
        router.push(next);
        return;
      }
      startSocialEnrollment('telegram', result.enrollmentToken);
    } catch {
      setError('Не удалось войти через Telegram.');
    } finally {
      setBusy(false);
    }
  }

  async function loginTelegram() {
    if (!telegramInitData || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await telegramLogin(telegramInitData, 'mini_app');
      if (result.status === 'authenticated') {
        setSocialEnrollmentToken(null);
        router.push(next);
        return;
      }
      startSocialEnrollment('telegram', result.enrollmentToken);
    } catch {
      setError('Не удалось войти через Telegram.');
    } finally {
      setBusy(false);
    }
  }

  async function loginApple() {
    if (busy || !appleEnabled || !appleClientId) return;
    setError(null);
    setBusy(true);
    try {
      await loadAppleSdk();
      if (!window.AppleID) throw new Error('apple-sdk-not-available');
      const nonce = createAppleNonce();
      window.AppleID.auth.init({
        clientId: appleClientId,
        scope: 'name email',
        redirectURI: window.location.origin + '/login',
        usePopup: true,
        nonce,
      });
      const response = await window.AppleID.auth.signIn();
      const name = response.user?.name
        ? [response.user.name.firstName, response.user.name.lastName].filter(Boolean).join(' ')
        : undefined;
      const result = await appleLogin(response.authorization.id_token, { nonce, name });
      if (result.status === 'authenticated') {
        setSocialEnrollmentToken(null);
        router.push(next);
        return;
      }
      startSocialEnrollment('apple', result.enrollmentToken);
    } catch {
      setError('Не удалось войти через Apple.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Общий шаг для Apple и Telegram: провайдер подтвердил личность, но телефона у
   * аккаунта ещё нет. Экран переключается на ввод номера — привязка завершится
   * SMS-кодом, как того требует `completeSocialEnrollment`.
   */
  function startSocialEnrollment(provider: 'telegram' | 'apple', token: string) {
    /**
     * Провайдер личность подтвердил, но телефона у аккаунта ещё нет — а привязка
     * завершается SMS-кодом. Если телефонный канал мёртв, переключать экран на
     * ввод номера нельзя: кнопка отправки там заблокирована, и человек застревает
     * уже ПОСЛЕ успешного входа у провайдера. Сервер знает это заранее и
     * присылает `registers: false` — говорим прямо, вместо тупика.
     */
    if (!phoneLoginEnabled) {
      setError(
        `Вход через ${provider === 'apple' ? 'Apple' : 'Telegram'} сейчас доступен только тем, `
        + 'кто уже привязал номер телефона: первая привязка требует кода по SMS, а его отправка не работает.',
      );
      return;
    }
    setSocialEnrollmentProvider(provider);
    setSocialEnrollmentToken(token);
    setChannel('phone');
    setStepCode(false);
    setPhone('+996');
    setCode('');
    setDevCode(null);
    setChallengeId(null);
    setResendSeconds(0);
    setStatus(null);
  }

  function switchMode(nextMode: Mode) {
    setSocialEnrollmentToken(null);
    setMode(nextMode);
    setStepCode(false);
    setCode('');
    setDevCode(null);
    setChallengeId(null);
    setResendSeconds(0);
    setError(null);
    setStatus(null);
  }

  function switchChannel(nextChannel: Channel) {
    setSocialEnrollmentToken(null);
    // Восстановление живёт только на телефонном канале — уходя на почту,
    // возвращаем обычный вход, иначе экран остался бы в противоречивом виде.
    setMode('login');
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
    setSocialEnrollmentToken(null);
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

        {!stepCode && !socialEnrollmentActive && (
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

        {!stepCode && !socialEnrollmentActive && channel === 'phone' && recoveryEnabled && (
          <div
            aria-label="Режим"
            className="login-modes mt-2 grid grid-cols-2 gap-2 rounded-[13px] border border-white/[0.08] bg-black/20 p-1"
          >
            <button
              type="button"
              aria-pressed={mode === 'login'}
              data-testid="login-mode-login"
              onClick={() => switchMode('login')}
              className={`rounded-[10px] px-3 py-2.5 text-sm font-bold transition-colors ${mode === 'login' ? 'bg-coral text-white' : 'text-muted hover:text-white'}`}
            >
              {t('login.mode.login')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'recover'}
              data-testid="login-mode-recover"
              onClick={() => switchMode('recover')}
              className={`rounded-[10px] px-3 py-2.5 text-sm font-bold transition-colors ${mode === 'recover' ? 'bg-coral text-white' : 'text-muted hover:text-white'}`}
            >
              {t('login.mode.recover')}
            </button>
          </div>
        )}

        {nothingAvailable ? (
          /**
           * Ни один канал не настроен. Раньше здесь всё равно рисовалась форма
           * телефона: покупатель вводил номер, жал «Получить код» и упирался в
           * 503 — вход выглядел сломанным, хотя это конфигурация. Говорим прямо
           * и уводим туда, где заказ оформить всё-таки можно.
           */
          <div className="mt-6">
            <p role="status" className="rounded-[13px] border border-white/[0.11] bg-black/25 p-4 text-sm leading-relaxed text-muted">
              Вход в личный кабинет сейчас недоступен — ни один канал подтверждения
              не подключён. Заказ можно оформить без аккаунта: доставка и оплата
              при получении работают как обычно.
            </p>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="mt-5 w-full rounded-[13px] bg-coral py-3.5 text-center text-[15px] font-bold text-white"
            >
              {t('login.guest')}
            </button>
          </div>
        ) : !stepCode ? (
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
            {channel === 'phone' && !phoneLoginEnabled && (
              // Телефонный канал выключен, но какой-то другой вход жив. Кнопку
              // не убираем молча — объясняем, иначе форма выглядит поломанной.
              <p role="status" className="mt-2 text-sm leading-relaxed text-muted">
                Код по SMS сейчас не отправляется. Выберите другой способ входа.
              </p>
            )}
            {error && <p role="alert" aria-live="assertive" className="mt-2 text-sm text-danger-soft">{error}</p>}
            <button
              type="submit"
              disabled={busy || (channel === 'phone' && !phoneLoginEnabled)}
              className="mt-3 w-full rounded-[13px] bg-coral py-3.5 text-center text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busy
                ? t('login.cta.sending')
                : channel === 'email'
                  ? t('login.cta.email')
                  : recovering
                    ? t('login.cta.recovery')
                    : t('login.cta.sms')}
            </button>
            {channel === 'phone' && (telegramEnabled || appleEnabled) && !socialEnrollmentActive && (
              <div className="mt-3 flex gap-2.5">
                {telegramEnabled && (
                  <button
                    type="button"
                    onClick={loginTelegram}
                    disabled={busy}
                    className="w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3 text-center text-sm font-semibold text-white disabled:text-faint disabled:opacity-70"
                  >
                    Telegram
                  </button>
                )}
                {appleEnabled && (
                  <button
                    type="button"
                    onClick={loginApple}
                    disabled={busy}
                    className="w-full rounded-[13px] border border-surface-3 bg-surface-2 p-3 text-center text-sm font-semibold text-white disabled:text-faint disabled:opacity-70"
                  >
                    Apple
                  </button>
                )}
              </div>
            )}
            {channel === 'phone' && telegramWidgetEnabled && !socialEnrollmentActive && (
              // Виджет рисует Telegram своим скриптом — своей кнопки здесь нет.
              <div ref={telegramWidgetSlot} className="mt-3 flex justify-center" />
            )}
            {socialEnrollmentActive && (
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
            {socialEnrollmentActive && (
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
