'use client';

import { useEffect, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { loadAddresses, saveAddresses, type SavedAddress } from '@/lib/account-local';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    setAddresses(loadAddresses());
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) saveAddresses(addresses); }, [addresses, hydrated]);

  function addAddress() {
    if (!title.trim() || !text.trim()) return;
    setAddresses((list) => [
      ...list.map((a) => ({ ...a, main: list.length === 0 ? false : a.main })),
      { id: String(Date.now()), title: title.trim(), text: text.trim(), comment: comment.trim() || undefined, main: addresses.length === 0 },
    ]);
    setTitle('');
    setText('');
    setComment('');
  }

  function removeAddress(id: string) {
    setAddresses((list) => {
      const next = list.filter((a) => a.id !== id);
      return next.some((a) => a.main) ? next : next.map((a, i) => ({ ...a, main: i === 0 }));
    });
  }

  function makeMain(id: string) {
    setAddresses((list) => list.map((a) => ({ ...a, main: a.id === id })));
  }

  return (
    <MobileAppFrame title="Адреса доставки" subtitle="Основной адрес автоматически подставляется в checkout." backHref="/account">
      {addresses.map((a) => (
        <div key={a.id} className={`mb-2.5 rounded-[14px] border bg-[#221E19] p-4 ${a.main ? 'border-lime' : 'border-[#2E2822]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{a.title}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-[#A79C92]">{a.text}</div>
              {a.comment && <div className="mt-1 font-mono text-[11px] text-[#6E645C]">{a.comment}</div>}
            </div>
            {a.main && <span className="flex-shrink-0 rounded-md bg-lime/15 px-2 py-1 text-[10px] font-semibold text-lime">основной</span>}
          </div>
          <div className="mt-3 flex gap-2">
            {!a.main && <button type="button" onClick={() => makeMain(a.id)} className="rounded-[8px] bg-[#2E2822] px-3 py-1.5 text-xs text-[#D8CFC6]">Сделать основным</button>}
            <button type="button" onClick={() => removeAddress(a.id)} className="rounded-[8px] bg-[#2E2822] px-3 py-1.5 text-xs text-[#FF8A7A]">Удалить</button>
          </div>
        </div>
      ))}

      <div className="mt-4 rounded-[14px] border border-dashed border-[#3A342E] bg-[#221E19] p-4">
        <div className="mb-3 text-sm font-semibold">Добавить адрес</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название: дом, работа" className="mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#16130F] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Город, улица, дом, квартира" className="mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#16130F] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий курьеру" className="mb-3 w-full rounded-[12px] border border-[#2E2822] bg-[#16130F] p-3 text-sm outline-none placeholder:text-[#6E645C] focus:border-lime" />
        <button type="button" onClick={addAddress} disabled={!title.trim() || !text.trim()} className="w-full rounded-[12px] bg-lime py-3 text-sm font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">Сохранить адрес</button>
      </div>
    </MobileAppFrame>
  );
}
