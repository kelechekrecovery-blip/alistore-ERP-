'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { createMyAddress, deleteMyAddress, fetchMyAddresses, updateMyAddress, type CustomerAddress } from '@/lib/api';

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID() ?? `address-${Date.now()}-${Math.random()}`;
}

export default function AddressesPage() {
  const { user, authed } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(newIdempotencyKey());

  const reload = useCallback(() => {
    if (!user) return Promise.resolve();
    return authed(fetchMyAddresses).then(setAddresses).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Не удалось загрузить адреса'));
  }, [user, authed]);
  useEffect(() => { void reload(); }, [reload]);

  function edit(command: () => Promise<unknown>) {
    setBusy(true); setError('');
    void command().then(reload).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Не удалось изменить адрес')).finally(() => setBusy(false));
  }

  function addAddress() {
    if (!title.trim() || !text.trim()) return;
    const commandKey = key.current;
    edit(() => authed((token) => createMyAddress({ title: title.trim(), text: text.trim(), comment: comment.trim() || undefined }, commandKey, token)).then(() => {
      setTitle(''); setText(''); setComment(''); key.current = newIdempotencyKey();
    }));
  }

  return (
    <MobileAppFrame title="Адреса доставки" subtitle="Основной адрес синхронизируется между сайтом и приложением." backHref="/account">
      {!user && <Link href="/login?next=/account/addresses" className="block rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Войдите по OTP, чтобы управлять адресами.</Link>}
      {error && <div className="mb-3 rounded-[13px] border border-danger-soft/30 bg-surface-2 p-4 text-sm text-danger-soft">{error}</div>}
      {user && addresses === null && !error && <div className="py-12 text-center text-sm text-muted">Загружаем адреса…</div>}
      {addresses?.length === 0 && <div className="mb-3 rounded-[13px] border border-surface-3 bg-surface-2 p-4 text-sm text-muted">Сохранённых адресов пока нет.</div>}
      {addresses?.map((address) => (
        <div key={address.id} className={`mb-2.5 rounded-[14px] border bg-surface-2 p-4 ${address.isPrimary ? 'border-lime' : 'border-surface-3'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="text-sm font-semibold">{address.title}</div><div className="mt-1 text-[13px] leading-relaxed text-muted">{address.text}</div>{address.comment && <div className="mt-1 font-mono text-[11px] text-faint">{address.comment}</div>}</div>
            {address.isPrimary && <span className="flex-shrink-0 rounded-md bg-lime/15 px-2 py-1 text-[10px] font-semibold text-lime">основной</span>}
          </div>
          <div className="mt-3 flex gap-2">
            {!address.isPrimary && <button disabled={busy} type="button" onClick={() => edit(() => authed((token) => updateMyAddress(address.id, { isPrimary: true }, token)))} className="rounded-[8px] bg-surface-3 px-3 py-1.5 text-xs text-bright">Сделать основным</button>}
            <button disabled={busy} type="button" onClick={() => edit(() => authed((token) => deleteMyAddress(address.id, token)))} className="rounded-[8px] bg-surface-3 px-3 py-1.5 text-xs text-danger-soft">Удалить</button>
          </div>
        </div>
      ))}

      {user && <div className="mt-4 rounded-[14px] border border-dashed border-line bg-surface-2 p-4">
        <div className="mb-3 text-sm font-semibold">Добавить адрес</div>
        <input value={title} onChange={(event) => { setTitle(event.target.value); key.current = newIdempotencyKey(); }} placeholder="Название: дом, работа" className="mb-2.5 w-full rounded-[8px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        <input value={text} onChange={(event) => { setText(event.target.value); key.current = newIdempotencyKey(); }} placeholder="Город, улица, дом, квартира" className="mb-2.5 w-full rounded-[8px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        <input value={comment} onChange={(event) => { setComment(event.target.value); key.current = newIdempotencyKey(); }} placeholder="Комментарий курьеру" className="mb-3 w-full rounded-[8px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        <button type="button" onClick={addAddress} disabled={busy || !title.trim() || !text.trim()} className="w-full rounded-[8px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-line disabled:text-faint">{busy ? 'Сохраняем…' : 'Сохранить адрес'}</button>
      </div>}
    </MobileAppFrame>
  );
}
