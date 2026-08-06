'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Card } from './Card';
import {
  fetchPartnerSellers,
  onboardSeller,
  type PartnerSeller,
} from '@/lib/api/business';

/**
 * AliStore Business — подключение магазинов-партнёров.
 *
 * До этого экрана партнёра можно было завести только скриптом или прямой
 * записью в базу, то есть в обход прав и аудита. Для операции, которая выдаёт
 * постороннему доступ к вашей витрине, это неприемлемо.
 */
export function PartnersView({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const [rows, setRows] = useState<PartnerSeller[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; username: string } | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', username: '', password: '' });

  async function load() {
    try {
      setRows(await fetchPartnerSellers(accessToken));
      setError('');
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'Список магазинов не загрузился');
    }
  }

  useEffect(() => { void load(); }, [accessToken]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onboardSeller(accessToken, form);
      // Пароль показываем один раз и только тот, что ввёл владелец: сервер его
      // не возвращает, и восстановить потом будет неоткуда — об этом говорим прямо.
      setCreated({ name: result.seller.name, username: result.username });
      setForm({ name: '', slug: '', username: '', password: '' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Магазин не заведён');
    } finally {
      setBusy(false);
    }
  }

  const ready = form.name.trim().length >= 2
    && /^[a-z0-9-]{2,40}$/.test(form.slug.trim())
    && form.username.trim().length >= 3
    && form.password.length >= 10;

  return (
    <div className="space-y-3.5">
      <Card className="p-5">
        <div className="font-display text-[15px] font-bold text-white">Магазины-партнёры</div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Партнёр входит в отдельное приложение <span className="font-mono text-subtle">/business</span> и
          ведёт там только свой ассортимент. Ваш учёт, склад и касса ему недоступны.
          {!canEdit && ' У вашей роли доступ только на чтение — подключать магазины может владелец.'}
        </p>
      </Card>

      {error && <Card className="p-4"><p role="alert" className="text-sm text-danger-soft">{error}</p></Card>}

      {created && (
        <Card className="p-5">
          <div className="text-sm font-semibold text-lime">Магазин «{created.name}» подключён</div>
          <p className="mt-1 text-xs leading-5 text-muted">
            Логин: <span className="font-mono text-white">{created.username}</span>. Передайте его
            вместе с паролем, который вы ввели — сервер пароль не хранит в открытом виде и показать
            его повторно не сможет.
          </p>
        </Card>
      )}

      {canEdit && (
        <Card className="p-5">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <label className="text-[12px] text-subtle">
              Название магазина
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="mt-1 h-10 w-full rounded-[8px] border border-surface-3 bg-surface-2 px-3 text-sm text-white outline-none focus:border-coral"
              />
            </label>
            <label className="text-[12px] text-subtle">
              Ссылка (латиница, цифры, дефис)
              <input
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })}
                placeholder="mobile-plus"
                className="mt-1 h-10 w-full rounded-[8px] border border-surface-3 bg-surface-2 px-3 font-mono text-sm text-white outline-none focus:border-coral"
              />
            </label>
            <label className="text-[12px] text-subtle">
              Логин для входа
              <input
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
                autoComplete="off"
                className="mt-1 h-10 w-full rounded-[8px] border border-surface-3 bg-surface-2 px-3 font-mono text-sm text-white outline-none focus:border-coral"
              />
            </label>
            <label className="text-[12px] text-subtle">
              Пароль (от 10 символов)
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="new-password"
                className="mt-1 h-10 w-full rounded-[8px] border border-surface-3 bg-surface-2 px-3 text-sm text-white outline-none focus:border-coral"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={!ready || busy}
                className="h-10 rounded-[8px] bg-coral px-4 text-xs font-bold text-white disabled:bg-surface-2 disabled:text-subtle"
              >
                {busy ? 'Подключаем…' : 'Подключить магазин'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <div className="font-display text-[14px] font-bold text-white">Подключённые</div>
        {rows === null && !error && <p className="mt-2 text-sm text-muted">Загрузка…</p>}
        {rows !== null && rows.length === 0 && (
          <p className="mt-2 text-[12px] text-muted">Пока ни одного магазина.</p>
        )}
        {rows !== null && rows.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between border-t border-surface-2 pt-2">
                <div>
                  <div className="text-[13px] font-semibold text-white">{row.name}</div>
                  <div className="font-mono text-[11px] text-subtle">{row.slug}</div>
                </div>
                <span className={`rounded-chip px-2 py-0.5 text-[10px] font-semibold ${row.active ? 'bg-lime/15 text-lime' : 'bg-surface-2 text-subtle'}`}>
                  {row.active ? 'активен' : 'выключен'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
