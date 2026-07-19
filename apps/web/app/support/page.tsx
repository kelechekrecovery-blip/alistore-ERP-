'use client';

import { useEffect, useState } from 'react';
import { EvidencePicker } from '@/components/EvidencePicker';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';
import { createCustomer, fetchSupportTickets, openSupportTicket, uploadEvidenceImages, type SupportTicket } from '@/lib/api';

const faq = ['Как отследить заказ?', 'Условия возврата и обмена', 'Как работает рассрочка?', 'Гарантия на Б/У технику'];
const channels = [
  { id: 'whatsapp', icon: '💬', label: 'WhatsApp', cls: 'bg-[#1F3D2E] text-lime' },
  { id: 'telegram', icon: '✈️', label: 'Telegram', cls: 'bg-[#1E3346] text-info' },
  { id: 'call', icon: '📞', label: 'Звонок', cls: 'border border-surface-3 bg-surface-2 text-bright' },
] as const;

export default function SupportPage() {
  const { user, authed } = useAuth();
  const [channel, setChannel] = useState<(typeof channels)[number]['id']>('whatsapp');
  const [subject, setSubject] = useState('Помощь с заказом');
  const [body, setBody] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [done, setDone] = useState<{ ticket: SupportTicket; evidenceCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (user?.phone) setPhone((p) => p || user.phone); }, [user?.phone]);
  useEffect(() => {
    if (!user?.customerId) return;
    authed((token) => fetchSupportTickets(user.customerId, token)).then(setTickets).catch(() => setTickets([]));
  }, [user?.customerId, done, authed]);

  async function submit() {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const guest = user ? null : await createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
      const customerId = user?.customerId ?? guest!.id;
      const create = (accessToken?: string) => openSupportTicket({
        customerId,
        channel,
        subject: subject.trim(),
        body: body.trim(),
        priority: subject.toLowerCase().includes('возврат') || subject.toLowerCase().includes('гарант') ? 'high' : 'normal',
        actor: 'customer_app',
      }, { accessToken, guestCapability: guest?.guestCapability });
      const ticket = user ? await authed(create) : await create();
      const evidence = files.length
        ? await uploadEvidenceImages({
            files,
            entityType: 'support',
            entityId: ticket.id,
            label: 'support_attachment',
            actor: customerId,
            ...(user
              ? { accessToken: await authed(async (token) => token) }
              : { guestCapability: guest!.guestCapability }),
          })
        : [];
      setDone({ ticket, evidenceCount: evidence.length });
      setBody('');
      setFiles([]);
    } catch {
      setError('Не удалось создать обращение или загрузить фото. Проверьте телефон и текст обращения.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileAppFrame title="Поддержка" subtitle="Создаём тикет в Support Inbox и сохраняем историю в CRM." active="account" backHref="/account">
      <div className="mb-4 rounded-[14px] border border-lime/30 bg-lime/10 p-4 text-sm leading-6 text-bright">
        Связаться с AliStore можно через форму ниже. Укажите телефон, тему и описание —
        обращение будет зарегистрировано, а ответ появится в истории обращений после входа.
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {channels.map((c) => (
          <button key={c.id} type="button" onClick={() => setChannel(c.id)} className={`rounded-[13px] p-3.5 text-center ${c.cls} ${channel === c.id ? 'ring-2 ring-lime' : ''}`}>
            <div className="text-2xl">{c.icon}</div>
            <div className="mt-1.5 text-[12px] font-semibold">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="mb-2 text-[13px] text-muted">Частые вопросы</div>
      {faq.map((item) => (
        <button key={item} type="button" onClick={() => { setSubject(item); setBody((b) => b || `${item}: `); }} className="mb-2 flex w-full items-center justify-between rounded-[11px] border border-surface-3 bg-surface-2 p-3 text-left text-[13px] text-bright">
          <span>{item}</span>
          <span className="text-faint">▾</span>
        </button>
      ))}

      <div className="mt-4 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
        <div className="mb-3 text-sm font-semibold">Создать обращение</div>
        {!user && (
          <div className="mb-2 grid grid-cols-1 gap-2">
            <input aria-label="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="rounded-[12px] border border-surface-3 bg-ink-dark p-3 font-mono text-sm outline-none placeholder:text-faint focus:border-lime" />
            <input aria-label="Имя" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" className="rounded-[12px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
          </div>
        )}
        <input aria-label="Тема обращения" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Тема" className="mb-2 w-full rounded-[12px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        <textarea aria-label="Описание ситуации" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Опишите ситуацию: заказ, IMEI, что произошло" className="min-h-[96px] w-full rounded-[12px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        <div className="mt-2">
          <EvidencePicker files={files} onChange={setFiles} label="Фото к обращению" hint="Чек, дефект, скрин ошибки" max={4} />
        </div>
        {done && <p className="mt-2 font-mono text-[12px] text-lime">✓ Тикет #{done.ticket.id.slice(-8)} создан · фото {done.evidenceCount} · SLA: {new Date(done.ticket.sla).toLocaleString('ru-RU')}</p>}
        {error && <p className="mt-2 text-sm text-danger-soft">{error}</p>}
        <button type="button" disabled={busy || !subject.trim() || !body.trim() || (!user && phone.trim().length < 9)} onClick={submit} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-line disabled:text-faint">{busy ? 'Создаём…' : 'Создать обращение'}</button>
      </div>

      {tickets.length > 0 && (
        <>
          <div className="mb-2 mt-5 text-[13px] text-muted">Мои обращения</div>
          {tickets.map((t) => (
            <div key={t.id} className="mb-2 rounded-[13px] border border-surface-3 bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-subtle">#{t.id.slice(-8)}</span>
                <span className="rounded-md bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">{t.status}</span>
              </div>
              <div className="mt-1 text-[13px] font-semibold">{t.subject}</div>
              <div className="mt-1 text-[11px] text-subtle">SLA {new Date(t.sla).toLocaleString('ru-RU')}</div>
            </div>
          ))}
        </>
      )}
    </MobileAppFrame>
  );
}
