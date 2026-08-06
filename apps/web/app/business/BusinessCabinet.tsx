'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { som } from '@/lib/format';
import {
  businessLogin,
  clearBusinessSession,
  fetchBusinessProducts,
  loadBusinessSession,
  saveBusinessSession,
  updateBusinessPrice,
  type BusinessProduct,
  type BusinessSession,
} from '@/lib/api/business';

/**
 * AliStore Business — кабинет магазина-партнёра.
 *
 * Отдельное приложение: ни шапки витрины, ни навигации ERP. Партнёр не имеет
 * отношения к ERP, POS и кассе, и интерфейс обязан это показывать — иначе
 * человек ищет здесь склад и отчёты, которых у него нет и не будет.
 */
export default function BusinessCabinet() {
  const [session, setSession] = useState<BusinessSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(loadBusinessSession());
    setHydrated(true);
  }, []);

  // До гидратации не показываем ни форму входа, ни кабинет: мигание «войдите» у
  // вошедшего человека читается как разлогин.
  if (!hydrated) {
    return <Shell><p className="text-sm text-white/50">Загрузка…</p></Shell>;
  }

  if (!session) {
    return (
      <Shell>
        <LoginForm onSuccess={(next) => { saveBusinessSession(next); setSession(next); }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Assortment
        session={session}
        onSignOut={() => { clearBusinessSession(); setSession(null); }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0b0a08] text-[#e5dcd3]">
      <header className="border-b border-white/10 px-5 py-4">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between">
          <div>
            <div className="font-display text-[17px] font-extrabold text-white">AliStore Business</div>
            <div className="text-[11px] text-white/45">Кабинет магазина-партнёра</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-5 py-8">{children}</main>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (session: BusinessSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSuccess(await businessLogin(username, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-[380px] rounded-[14px] border border-white/10 bg-white/[.03] p-6">
      <h1 className="font-display text-[20px] font-extrabold text-white">Вход магазина</h1>
      <p className="mt-1 text-[12px] leading-5 text-white/45">
        Логин выдаёт AliStore. Это не учётная запись ERP — здесь только ваш ассортимент.
      </p>
      <label className="mt-5 block text-[12px] text-white/55" htmlFor="business-username">Логин</label>
      <input
        id="business-username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        className="mt-1 h-11 w-full rounded-[9px] border border-white/12 bg-white/[.04] px-3 text-sm text-white outline-none focus:border-[#c6ff3d]"
      />
      <label className="mt-4 block text-[12px] text-white/55" htmlFor="business-password">Пароль</label>
      <input
        id="business-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        className="mt-1 h-11 w-full rounded-[9px] border border-white/12 bg-white/[.04] px-3 text-sm text-white outline-none focus:border-[#c6ff3d]"
      />
      {error && <p role="alert" className="mt-3 text-[12px] text-[#ff9a6e]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !username || !password}
        className="mt-5 h-11 w-full rounded-[9px] bg-[#c6ff3d] text-sm font-bold text-black disabled:bg-white/10 disabled:text-white/35"
      >
        {busy ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}

function Assortment({ session, onSignOut }: { session: BusinessSession; onSignOut: () => void }) {
  const [rows, setRows] = useState<BusinessProduct[] | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    try {
      setRows(await fetchBusinessProducts(session.accessToken));
      setError('');
    } catch (cause) {
      // Уже загруженные строки не стираем. Раньше неудачный рефреш после
      // успешного сохранения обнулял таблицу: партнёр видел зелёное «цена
      // сохранена» и тут же пустой экран с ошибкой — выглядело как поломка
      // ровно в момент успеха, хотя цена записалась.
      setRows((current) => current);
      setError(cause instanceof Error ? cause.message : 'Список не обновился');
    }
  }

  useEffect(() => { void load(); }, [session.accessToken]);

  async function savePrice(row: BusinessProduct) {
    const draft = drafts[row.id];
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1) {
      setError('Цена — целое число от 1 сома');
      return;
    }
    setBusy(row.id);
    setError('');
    try {
      await updateBusinessPrice(session.accessToken, row.id, next);
      setDrafts((current) => { const copy = { ...current }; delete copy[row.id]; return copy; });
      setToast(`${row.name} — цена сохранена`);
      window.setTimeout(() => setToast(''), 2600);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Цена не сохранена');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-extrabold text-white">{session.seller.name}</h1>
          <p className="text-[12px] text-white/45">Вошли как {session.username}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="h-9 rounded-[8px] border border-white/12 px-3 text-[12px] font-semibold text-white/70"
        >
          Выйти
        </button>
      </div>

      {toast && <p className="mt-4 rounded-[9px] bg-[#c6ff3d]/12 px-3 py-2 text-[12px] text-[#c6ff3d]">{toast}</p>}
      {error && <p role="alert" className="mt-4 rounded-[9px] bg-[#ff9a6e]/10 px-3 py-2 text-[12px] text-[#ff9a6e]">{error}</p>}

      {rows === null && !error && <p className="mt-6 text-sm text-white/50">Загрузка…</p>}

      {rows !== null && rows.length === 0 && (
        // Пустой ассортимент — нормальное начало, а не сбой. Говорим, что делать
        // дальше, вместо пустого экрана, который читается как поломка.
        <div className="mt-6 rounded-[12px] border border-white/10 bg-white/[.03] p-6">
          <div className="text-sm font-semibold text-white">Пока ни одной позиции</div>
          <p className="mt-1 text-[12px] leading-5 text-white/50">
            Товары заводит AliStore при подключении магазина. Как только они появятся,
            вы сможете менять здесь цену.
          </p>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                <th className="py-2 pr-3 font-semibold">Товар</th>
                <th className="py-2 pr-3 font-semibold">Артикул</th>
                <th className="py-2 pr-3 font-semibold">Цена</th>
                <th className="py-2 font-semibold">Новая цена</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? '';
                const dirty = draft.trim() !== '' && Number(draft) !== row.price;
                return (
                  <tr key={row.id} className="border-b border-white/[.06]" data-testid={`business-row-${row.sku}`}>
                    <td className="py-3 pr-3 text-[13px] text-white">
                      {row.name}
                      {row.archived && <span className="ml-2 rounded-chip bg-white/10 px-2 py-0.5 text-[10px] text-white/50">архив</span>}
                    </td>
                    <td className="py-3 pr-3 font-mono text-[12px] text-white/50">{row.sku}</td>
                    <td className="py-3 pr-3 text-[13px] font-semibold text-white">{som(row.price)}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Новая цена: ${row.name}`}
                          inputMode="numeric"
                          value={draft}
                          onChange={(event) => setDrafts({ ...drafts, [row.id]: event.target.value })}
                          className="h-9 w-28 rounded-[7px] border border-white/12 bg-white/[.04] px-2.5 text-right font-mono text-sm text-white outline-none focus:border-[#c6ff3d]"
                        />
                        <button
                          type="button"
                          disabled={!dirty || busy === row.id}
                          onClick={() => void savePrice(row)}
                          className="h-9 rounded-[7px] bg-[#c6ff3d] px-3 text-[12px] font-bold text-black disabled:bg-white/10 disabled:text-white/35"
                        >
                          {busy === row.id ? '…' : 'Сохранить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
