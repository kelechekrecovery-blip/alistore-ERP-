'use client';

import Link from 'next/link';
import {
  Banknote,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  LogOut,
  MapPinned,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  ShieldAlert,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  completeCourierDelivery,
  failCourierDelivery,
  fetchCourierDeliveries,
  outstandingCourierCod,
  removeCourierDelivery,
  startCourierDelivery,
  uploadEvidenceImages,
  type CourierDelivery,
  type CourierRunSummary,
} from '@/lib/api';
import { som } from '@/lib/format';
import {
  clearStaffSession,
  restoreStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

type CourierTab = 'route' | 'cod' | 'profile';
type CommandKeys = Record<string, string>;

const STATUS_LABEL: Record<CourierDelivery['status'], string> = {
  courier_assigned: 'Назначено',
  out_for_delivery: 'В пути',
  delivered: 'Доставлено',
};

export default function CourierPage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [deliveries, setDeliveries] = useState<CourierDelivery[] | null>(null);
  const [tab, setTab] = useState<CourierTab>('route');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    void restoreStaffSession().then(setSession);
    const updateOnline = () => setOnline(window.navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const load = useCallback(async () => {
    if (!session || session.role !== 'courier') return;
    const version = ++requestVersion.current;
    setRefreshing(true);
    setError('');
    try {
      const result = await fetchCourierDeliveries(session.accessToken);
      if (version === requestVersion.current) setDeliveries(result);
    } catch (loadError) {
      if (version === requestVersion.current) {
        setDeliveries((current) => current ?? []);
        setError(loadError instanceof Error ? loadError.message : 'Маршрут не загрузился');
      }
    } finally {
      if (version === requestVersion.current) setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    setDeliveries(null);
    setError('');
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  function logout() {
    requestVersion.current += 1;
    clearStaffSession();
    setSession(null);
    setDeliveries(null);
    setError('');
    setTab('route');
  }

  if (!session) {
    return (
      <main className="fixed inset-0 z-50 grid place-items-center bg-[#16130f] p-4">
        <Link href="/" className="fixed right-4 top-4 text-sm font-semibold text-white/70 hover:text-white">
          На сайт
        </Link>
        <StaffSessionLogin
          title="AliStore Courier"
          caption="Войдите под учётной записью курьера."
          onAuthenticated={setSession}
        />
      </main>
    );
  }

  if (session.role !== 'courier') {
    return (
      <main className="fixed inset-0 z-50 grid place-items-center bg-[#16130f] p-5 text-white">
        <section className="w-full max-w-sm rounded-[8px] border border-white/10 bg-[#211d18] p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#ff7657]" aria-hidden />
          <h1 className="mt-4 font-display text-xl font-bold">Нужна роль courier</h1>
          <p className="mt-2 text-sm text-white/55">
            Эта рабочая зона показывает только доставки текущего курьера.
          </p>
          <button type="button" onClick={logout} className="mt-5 w-full rounded-[6px] bg-[#c8ff38] px-4 py-3 font-bold text-[#16130f]">
            Войти другим сотрудником
          </button>
        </section>
      </main>
    );
  }

  const rows = deliveries ?? [];
  return (
    <main className="min-h-screen bg-[#0e0d0b] text-white" data-testid="courier-app">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#16130f] p-5 lg:flex lg:flex-col">
          <CourierBrand />
          <CourierNavigation tab={tab} setTab={setTab} />
          <div className="mt-auto border-t border-white/10 pt-4">
            <p className="truncate text-sm font-semibold">{session.username}</p>
            <p className="mt-1 text-xs text-white/45">Курьер · {session.staffId.slice(-6)}</p>
            <button type="button" onClick={logout} className="mt-4 flex items-center gap-2 text-sm text-white/55 hover:text-white">
              <LogOut className="h-4 w-4" aria-hidden /> Выйти
            </button>
          </div>
        </aside>

        <section className="min-w-0 pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-[#16130f]/95 px-4 py-3 backdrop-blur lg:px-7">
            <div className="lg:hidden"><CourierBrand compact /></div>
            <span className={`ml-auto flex items-center gap-1.5 text-xs ${online ? 'text-[#c8ff38]' : 'text-[#ff7657]'}`}>
              {online ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <WifiOff className="h-3.5 w-3.5" aria-hidden />}
              {online ? 'Онлайн' : 'Нет сети'}
            </span>
            <button
              type="button"
              aria-label="Обновить маршрут"
              onClick={() => void load()}
              disabled={refreshing}
              className="grid h-9 w-9 place-items-center rounded-[6px] border border-white/10 text-white/70 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </header>

          {tab === 'route' && <RouteWorkspace deliveries={rows} loading={deliveries === null} error={error} session={session} reload={load} />}
          {tab === 'cod' && <CodWorkspace deliveries={rows} loading={deliveries === null} error={error} reload={load} />}
          {tab === 'profile' && <ProfileWorkspace session={session} deliveries={rows} online={online} logout={logout} />}
        </section>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-white/10 bg-[#16130f] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
          <MobileTab active={tab === 'route'} label="Маршрут" icon={Route} onClick={() => setTab('route')} />
          <MobileTab active={tab === 'cod'} label="COD" icon={Banknote} onClick={() => setTab('cod')} />
          <MobileTab active={tab === 'profile'} label="Профиль" icon={CircleUserRound} onClick={() => setTab('profile')} />
        </nav>
      </div>
    </main>
  );
}

function CourierBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${compact ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'} grid place-items-center rounded-[6px] bg-[#c8ff38] font-display font-black text-[#16130f]`}>
        A
      </span>
      <div className={compact ? 'hidden min-[390px]:block' : ''}>
        <strong className="block font-display text-sm">AliStore</strong>
        <span className="text-[10px] font-semibold uppercase text-[#ff7657]">Courier 3.0</span>
      </div>
    </div>
  );
}

function CourierNavigation({ tab, setTab }: { tab: CourierTab; setTab: (tab: CourierTab) => void }) {
  return (
    <nav className="mt-10 space-y-1">
      <SideTab active={tab === 'route'} label="Мой маршрут" icon={Route} onClick={() => setTab('route')} />
      <SideTab active={tab === 'cod'} label="Сверка COD" icon={Banknote} onClick={() => setTab('cod')} />
      <SideTab active={tab === 'profile'} label="Профиль" icon={CircleUserRound} onClick={() => setTab('profile')} />
    </nav>
  );
}

function RouteWorkspace({
  deliveries,
  loading,
  error,
  session,
  reload,
}: {
  deliveries: CourierDelivery[];
  loading: boolean;
  error: string;
  session: StaffSession;
  reload: () => Promise<void>;
}) {
  const active = deliveries.filter((delivery) => delivery.status !== 'delivered');
  return (
    <div className="px-4 py-6 lg:px-7 lg:py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[#ff7657]">Сегодня · Бишкек</p>
          <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Мой маршрут</h1>
          <p className="mt-1 text-sm text-white/45">{active.length} активных · {deliveries.filter((delivery) => delivery.status === 'delivered').length} завершено</p>
        </div>
        <div className="hidden rounded-[6px] border border-white/10 bg-[#211d18] px-4 py-2 text-right sm:block">
          <span className="block text-[10px] uppercase text-white/40">К получению</span>
          <strong className="font-mono text-[#c8ff38]">{som(active.reduce((sum, delivery) => sum + outstandingCourierCod(delivery), 0))}</strong>
        </div>
      </div>
      {error && <ErrorPanel message={error} retry={reload} />}
      {loading ? <LoadingRows /> : active.length === 0 ? <EmptyRoute /> : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {active.map((delivery, index) => (
            <DeliveryCard key={delivery.id} delivery={delivery} index={index + 1} session={session} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveryCard({
  delivery,
  index,
  session,
  reload,
}: {
  delivery: CourierDelivery;
  index: number;
  session: StaffSession;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [codAmount, setCodAmount] = useState(String(outstandingCourierCod(delivery)));
  const [partialReason, setPartialReason] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const commandKeys = useRef<CommandKeys>({});
  const outstanding = outstandingCourierCod(delivery);
  const amount = /^\d+$/.test(codAmount) ? Number(codAmount) : null;
  const partial = amount !== null && amount < outstanding;
  const validAmount = amount !== null && Number.isSafeInteger(amount) && amount >= 0 && amount <= outstanding;

  function keyFor(action: string) {
    commandKeys.current[action] ??= crypto.randomUUID();
    return commandKeys.current[action];
  }

  async function run(action: string, command: (key: string) => Promise<unknown>, success: string) {
    setBusy(action);
    setMessage('');
    try {
      await command(keyFor(action));
      delete commandKeys.current[action];
      setMessage(success);
    } catch (commandError) {
      setMessage(commandError instanceof Error ? commandError.message : 'Операция не выполнена');
      return;
    } finally {
      setBusy('');
    }
    void reload();
  }

  async function deliver() {
    if (!validAmount || amount === null) return;
    setBusy('deliver');
    setMessage('');
    try {
      const evidenceKeyPrefix = keyFor('evidence');
      await uploadEvidenceImages({
        files: evidenceFiles,
        entityType: 'order',
        entityId: delivery.id,
        label: 'Подтверждение доставки',
        accessToken: session.accessToken,
        idempotencyKeyPrefix: evidenceKeyPrefix,
      });
      await completeCourierDelivery(
        delivery.id,
        {
          codAmount: amount,
          evidenceIdempotencyKey: `${evidenceKeyPrefix}:0`,
          ...(partialReason.trim() ? { reason: partialReason.trim() } : {}),
        },
        session.accessToken,
        keyFor('deliver'),
      );
      delete commandKeys.current.evidence;
      delete commandKeys.current.deliver;
      setEvidenceFiles([]);
      setMessage('Доставка подтверждена сервером');
    } catch (commandError) {
      setMessage(commandError instanceof Error ? commandError.message : 'Доставка не завершена');
      return;
    } finally {
      setBusy('');
    }
    void reload();
  }

  async function failAndRemove() {
    const reason = failureReason.trim();
    if (!reason) return;
    setBusy('fail');
    setMessage('');
    try {
      const evidenceKeyPrefix = keyFor('failure-evidence');
      await uploadEvidenceImages({
        files: evidenceFiles,
        entityType: 'order',
        entityId: delivery.id,
        label: 'Неуспешная доставка',
        accessToken: session.accessToken,
        idempotencyKeyPrefix: evidenceKeyPrefix,
      });
      await failCourierDelivery(
        delivery.id,
        { reason, evidenceIdempotencyKey: `${evidenceKeyPrefix}:0` },
        session.accessToken,
        keyFor('fail'),
      );
      await removeCourierDelivery(delivery.id, reason, session.accessToken, keyFor('remove'));
      delete commandKeys.current['failure-evidence'];
      delete commandKeys.current.fail;
      delete commandKeys.current.remove;
      setMessage('Причина сохранена, заказ возвращён диспетчеру');
    } catch (commandError) {
      setMessage(commandError instanceof Error ? commandError.message : 'Неудача не записана');
      return;
    } finally {
      setBusy('');
    }
    void reload();
  }

  return (
    <article className="rounded-[8px] border border-white/10 bg-[#211d18] p-4 sm:p-5" data-testid={`courier-delivery-${delivery.id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#ff7657] font-mono text-sm font-bold">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold">{delivery.customer.name}</h2>
            <span className="ml-auto flex-none rounded-full bg-[#c8ff38]/10 px-2 py-1 text-[10px] font-bold text-[#c8ff38]">
              {STATUS_LABEL[delivery.status]}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-white/60">{delivery.deliveryAddress || 'Адрес не указан'}</p>
          {delivery.deliverySlot && <p className="mt-1 flex items-center gap-1.5 text-xs text-white/40"><Clock3 className="h-3.5 w-3.5" aria-hidden />{delivery.deliverySlot}</p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.deliveryAddress || 'Бишкек')}`}
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center justify-center gap-2 rounded-[6px] border border-white/10 text-sm font-semibold hover:border-[#c8ff38]/50"
        >
          <Navigation className="h-4 w-4" aria-hidden /> Маршрут
        </a>
        <a href={`tel:${delivery.customer.phone}`} className="flex h-10 items-center justify-center gap-2 rounded-[6px] border border-white/10 text-sm font-semibold hover:border-[#c8ff38]/50">
          <Phone className="h-4 w-4" aria-hidden /> Позвонить
        </a>
      </div>

      <div className="mt-4 border-y border-white/10 py-3">
        {delivery.items.map((item) => (
          <div key={`${item.sku}:${item.imei ?? ''}`} className="flex items-center gap-2 py-1 text-xs">
            <Box className="h-3.5 w-3.5 text-white/35" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{item.sku}</span>
            <span className="text-white/45">{item.qty} шт.</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-white/45">Получить COD</span>
          <strong className="font-mono text-[#c8ff38]">{som(outstanding)}</strong>
        </div>
      </div>

      {delivery.status === 'courier_assigned' && (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void run('start', (key) => startCourierDelivery(delivery.id, session.accessToken, key), 'Доставка начата')}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[#c8ff38] text-sm font-bold text-[#16130f] disabled:opacity-50"
        >
          Начать доставку <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}

      {delivery.status === 'out_for_delivery' && (
        <div className="mt-4 space-y-3">
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-white/20 px-3 text-sm text-white/65 hover:border-[#c8ff38]/60">
            <Upload className="h-4 w-4" aria-hidden />
            {evidenceFiles.length ? `Фото выбрано: ${evidenceFiles.length}` : 'Добавить фото Evidence'}
            <input
              aria-label={`Фото Evidence для заказа ${delivery.id}`}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setEvidenceFiles(Array.from(event.target.files ?? []));
                delete commandKeys.current.evidence;
                delete commandKeys.current['failure-evidence'];
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-white/55">
            Получено COD
            <input
              aria-label={`Получено COD для заказа ${delivery.id}`}
              value={codAmount}
              onChange={(event) => setCodAmount(event.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="mt-1.5 h-11 w-full rounded-[6px] border border-white/10 bg-[#16130f] px-3 font-mono text-white outline-none focus:border-[#c8ff38]"
            />
          </label>
          {partial && (
            <label className="block text-xs font-semibold text-white/55">
              Причина частичной оплаты
              <textarea
                aria-label={`Причина частичной оплаты для заказа ${delivery.id}`}
                value={partialReason}
                onChange={(event) => setPartialReason(event.target.value)}
                className="mt-1.5 min-h-20 w-full rounded-[6px] border border-white/10 bg-[#16130f] p-3 text-sm text-white outline-none focus:border-[#c8ff38]"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => void deliver()}
            disabled={Boolean(busy) || evidenceFiles.length === 0 || !validAmount || (partial && !partialReason.trim())}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[#c8ff38] text-sm font-bold text-[#16130f] disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Подтвердить доставку
          </button>
          <details className="rounded-[6px] border border-white/10 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#ff7657]">Не удалось доставить</summary>
            <textarea
              aria-label={`Причина неуспешной доставки ${delivery.id}`}
              value={failureReason}
              onChange={(event) => setFailureReason(event.target.value)}
              placeholder="Клиент недоступен, адрес не найден…"
              className="mt-3 min-h-20 w-full rounded-[6px] border border-white/10 bg-[#16130f] p-3 text-sm outline-none focus:border-[#ff7657]"
            />
            <button
              type="button"
              onClick={() => void failAndRemove()}
              disabled={Boolean(busy) || evidenceFiles.length === 0 || !failureReason.trim()}
              className="mt-2 h-10 w-full rounded-[6px] border border-[#ff7657]/50 text-sm font-bold text-[#ff7657] disabled:opacity-40"
            >
              Записать и вернуть диспетчеру
            </button>
          </details>
        </div>
      )}
      {message && <p role="status" className="mt-3 text-xs font-semibold text-[#c8ff38]">{message}</p>}
    </article>
  );
}

function CodWorkspace({
  deliveries,
  loading,
  error,
  reload,
}: {
  deliveries: CourierDelivery[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}) {
  const runs = useMemo(() => {
    const unique = new Map<string, CourierRunSummary>();
    for (const delivery of deliveries) {
      if (delivery.courierRun) unique.set(delivery.courierRun.id, delivery.courierRun);
    }
    return Array.from(unique.values());
  }, [deliveries]);
  return (
    <div className="px-4 py-6 lg:px-7 lg:py-8">
      <p className="text-xs font-semibold uppercase text-[#ff7657]">Финансовая операция</p>
      <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Сверка COD</h1>
      <p className="mt-2 max-w-xl text-sm text-white/45">Сдавайте только фактически собранные наличные. Итог и расхождение подтверждает сервер и Event Ledger.</p>
      {error && <ErrorPanel message={error} retry={reload} />}
      {loading ? <LoadingRows /> : runs.length === 0 ? <EmptyCod /> : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {runs.map((run) => <RunCard key={run.id} run={run} />)}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: CourierRunSummary }) {
  return (
    <article className="rounded-[8px] border border-white/10 bg-[#211d18] p-5" data-testid={`courier-run-${run.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold">Рейс {run.id.slice(-6)}</h2>
          <p className="mt-1 text-xs text-white/40">Собрано {som(run.collectedTotal)} из {som(run.codTotal)}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${run.handedOver ? 'bg-[#c8ff38]/10 text-[#c8ff38]' : 'bg-[#ff7657]/10 text-[#ff7657]'}`}>
          {run.handedOver ? 'Сверено' : 'К сдаче'}
        </span>
      </div>
      {!run.handedOver && (
        <div className="mt-4 rounded-[6px] border border-[#ff7657]/25 bg-[#ff7657]/5 p-3">
          <p className="text-xs leading-5 text-white/65">
            Передайте {som(run.collectedTotal)} кассиру. Денежную сверку подтверждает принимающий сотрудник.
          </p>
          <Link
            href={`/courier-cash?runId=${encodeURIComponent(run.id)}`}
            className="mt-3 flex h-10 items-center justify-center rounded-[6px] border border-white/10 text-sm font-bold text-white/80"
          >
            Открыть экран приёмки
          </Link>
        </div>
      )}
    </article>
  );
}

function ProfileWorkspace({ session, deliveries, online, logout }: { session: StaffSession; deliveries: CourierDelivery[]; online: boolean; logout: () => void }) {
  return (
    <div className="px-4 py-6 lg:px-7 lg:py-8">
      <p className="text-xs font-semibold uppercase text-[#ff7657]">Рабочий аккаунт</p>
      <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">{session.username}</h1>
      <section className="mt-6 max-w-xl rounded-[8px] border border-white/10 bg-[#211d18] p-5">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Роль" value="Курьер" />
          <Metric label="Связь" value={online ? 'Онлайн' : 'Нет сети'} accent={!online} />
          <Metric label="Активно" value={String(deliveries.filter((delivery) => delivery.status !== 'delivered').length)} />
          <Metric label="Доставлено" value={String(deliveries.filter((delivery) => delivery.status === 'delivered').length)} />
        </div>
        <button type="button" onClick={logout} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] border border-white/10 text-sm font-bold text-white/70">
          <LogOut className="h-4 w-4" aria-hidden /> Выйти из аккаунта
        </button>
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[6px] bg-[#16130f] p-3">
      <span className="block text-[10px] uppercase text-white/35">{label}</span>
      <strong className={`mt-1 block truncate font-mono text-sm ${accent ? 'text-[#ff7657]' : 'text-white'}`}>{value}</strong>
    </div>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <div role="alert" className="mt-5 flex items-center gap-3 rounded-[8px] border border-[#ff7657]/30 bg-[#ff7657]/10 p-4 text-sm text-[#ff9b82]">
      <ShieldAlert className="h-5 w-5 flex-none" aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" onClick={() => void retry()} className="font-bold text-white">Повторить</button>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-2" aria-label="Загрузка маршрута">
      {[0, 1].map((row) => <div key={row} className="h-52 animate-pulse rounded-[8px] border border-white/10 bg-[#211d18]" />)}
    </div>
  );
}

function EmptyRoute() {
  return (
    <div className="mt-6 grid min-h-72 place-items-center rounded-[8px] border border-dashed border-white/15 bg-[#16130f] p-6 text-center">
      <div><MapPinned className="mx-auto h-10 w-10 text-[#c8ff38]" aria-hidden /><h2 className="mt-3 font-display font-bold">Маршрут пока пуст</h2><p className="mt-1 text-sm text-white/45">Новая доставка появится после назначения диспетчером.</p></div>
    </div>
  );
}

function EmptyCod() {
  return (
    <div className="mt-6 grid min-h-60 place-items-center rounded-[8px] border border-dashed border-white/15 bg-[#16130f] p-6 text-center">
      <div><Banknote className="mx-auto h-10 w-10 text-[#c8ff38]" aria-hidden /><h2 className="mt-3 font-display font-bold">Нет рейсов для сверки</h2><p className="mt-1 text-sm text-white/45">COD появится после назначения рейса.</p></div>
    </div>
  );
}

function SideTab({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof Route; onClick: () => void }) {
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className={`flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-sm font-semibold ${active ? 'bg-[#c8ff38] text-[#16130f]' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}

function MobileTab({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof Route; onClick: () => void }) {
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'text-[#c8ff38]' : 'text-white/40'}`}>
      <Icon className="h-5 w-5" aria-hidden /> {label}
    </button>
  );
}
