'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import {
  acceptB2BQuote,
  createB2BQuote,
  fetchBusinessProfile,
  fetchCatalog,
  fetchMyB2BQuotes,
  saveBusinessProfile,
  type B2BQuote,
  type CatalogProduct,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { som } from '@/lib/format';

const STATUS: Record<B2BQuote['status'], string> = {
  requested: 'Новая заявка',
  reviewing: 'На расчёте',
  quoted: 'КП готово',
  accepted: 'Предложение принято',
  rejected: 'Отклонено',
};

export default function B2BPage() {
  const router = useRouter();
  const { user, hydrated, authed } = useAuth();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [quotes, setQuotes] = useState<B2BQuote[]>([]);
  const [profile, setProfile] = useState({
    companyName: '',
    taxId: '',
    contactName: '',
    email: '',
    billingAddress: '',
  });
  const [lines, setLines] = useState([{ sku: '', qty: '10', targetPrice: '' }]);
  const [paymentIntent, setPaymentIntent] = useState<'invoice' | 'bank_transfer'>('invoice');
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (hydrated && !user) router.replace('/login?next=/b2b');
  }, [hydrated, router, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      authed(fetchBusinessProfile),
      authed(fetchMyB2BQuotes),
      fetchCatalog({ limit: 100 }),
    ]).then(([saved, mine, catalog]) => {
      if (cancelled) return;
      if (saved) {
        setProfile({
          companyName: saved.companyName,
          taxId: saved.taxId,
          contactName: saved.contactName,
          email: saved.email ?? '',
          billingAddress: saved.billingAddress,
        });
      }
      setQuotes(mine);
      setProducts(catalog.items);
      setLines((current) => current.map((line, index) => ({
        ...line,
        sku: line.sku || (index === 0 ? catalog.items[0]?.sku : '') || '',
      })));
    }).catch(() => setMessage('Не удалось загрузить B2B-кабинет'));
    return () => { cancelled = true; };
  }, [authed, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lines.some((line) => !line.sku || Number(line.qty) < 1)) return;
    setBusy(true);
    setMessage('');
    try {
      await authed((token) => saveBusinessProfile({
        ...profile,
        email: profile.email || undefined,
      }, token));
      await authed((token) => createB2BQuote({
        paymentIntent,
        fulfillmentType,
        deliveryAddress: fulfillmentType === 'delivery' ? profile.billingAddress : undefined,
        pickupPoint: fulfillmentType === 'pickup' ? 'alistore-center' : undefined,
        comment: comment.trim() || undefined,
        items: lines.map((line) => ({
          sku: line.sku,
          qty: Number(line.qty),
          targetPrice: line.targetPrice ? Number(line.targetPrice) : undefined,
        })),
      }, token));
      setQuotes(await authed(fetchMyB2BQuotes));
      setComment('');
      setMessage('Заявка отправлена в корпоративный отдел');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    setBusy(true);
    try {
      await authed((token) => acceptB2BQuote(id, token));
      setQuotes(await authed(fetchMyB2BQuotes));
      setMessage('Коммерческое предложение принято');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось принять КП');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return <div className="fixed inset-0 grid place-items-center bg-ink-dark font-mono text-sm text-subtle">Загрузка…</div>;
  }

  return (
    <MobileAppFrame
      title="AliStore для бизнеса"
      subtitle="Оптовая заявка, безналичный счёт и персональное коммерческое предложение."
      active="account"
      backHref="/account"
    >
      <form onSubmit={submit} className="space-y-4" data-testid="b2b-form">
        <section className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <h2 className="font-display text-[15px] font-bold">Реквизиты покупателя</h2>
          <div className="mt-3 space-y-2">
            <Input testId="b2b-company" label="Компания" value={profile.companyName} onChange={(companyName) => setProfile((p) => ({ ...p, companyName }))} />
            <Input testId="b2b-tax-id" label="ИНН" value={profile.taxId} onChange={(taxId) => setProfile((p) => ({ ...p, taxId }))} />
            <Input testId="b2b-contact" label="Контакт" value={profile.contactName} onChange={(contactName) => setProfile((p) => ({ ...p, contactName }))} />
            <Input testId="b2b-email" label="Email" value={profile.email} onChange={(email) => setProfile((p) => ({ ...p, email }))} type="email" required={false} />
            <Input testId="b2b-address" label="Адрес" value={profile.billingAddress} onChange={(billingAddress) => setProfile((p) => ({ ...p, billingAddress }))} />
          </div>
        </section>

        <section className="rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <h2 className="font-display text-[15px] font-bold">Состав заявки</h2>
          {lines.map((line, index) => (
            <div key={index} className="mt-3 border-b border-surface-3 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-[12px] text-muted">
                  Товар {index + 1}
                  <select data-testid={index === 0 ? 'b2b-sku' : `b2b-sku-${index}`} value={line.sku} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item))} className="mt-1.5 w-full rounded-[10px] border border-surface-3 bg-ink-dark px-3 py-3 text-sm text-white">
                    <option value="" disabled>Выберите товар</option>
                    {products.map((product) => <option key={product.sku} value={product.sku}>{product.name} · {som(product.price)}</option>)}
                  </select>
                </label>
                {lines.length > 1 && (
                  <button type="button" aria-label={`Удалить товар ${index + 1}`} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-11 w-11 place-items-center rounded-[10px] border border-line text-lg text-danger-soft">×</button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input testId={index === 0 ? 'b2b-qty' : `b2b-qty-${index}`} label="Количество" value={line.qty} onChange={(qty) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qty } : item))} type="number" />
                <Input testId={index === 0 ? 'b2b-target' : `b2b-target-${index}`} label="Целевая цена" value={line.targetPrice} onChange={(targetPrice) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, targetPrice } : item))} type="number" required={false} />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setLines((current) => [...current, { sku: products[0]?.sku ?? '', qty: '1', targetPrice: '' }])} className="mt-3 w-full rounded-[10px] border border-dashed border-line py-2.5 text-xs font-semibold text-muted">+ Добавить товар</button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPaymentIntent('invoice')} className={`rounded-[10px] border px-3 py-2.5 text-xs font-semibold ${paymentIntent === 'invoice' ? 'border-lime text-lime' : 'border-surface-3 text-muted'}`}>Счёт на оплату</button>
            <button type="button" onClick={() => setPaymentIntent('bank_transfer')} className={`rounded-[10px] border px-3 py-2.5 text-xs font-semibold ${paymentIntent === 'bank_transfer' ? 'border-lime text-lime' : 'border-surface-3 text-muted'}`}>Банковский перевод</button>
            <button type="button" onClick={() => setFulfillmentType('delivery')} className={`rounded-[10px] border px-3 py-2.5 text-xs font-semibold ${fulfillmentType === 'delivery' ? 'border-lime text-lime' : 'border-surface-3 text-muted'}`}>Доставка</button>
            <button type="button" onClick={() => setFulfillmentType('pickup')} className={`rounded-[10px] border px-3 py-2.5 text-xs font-semibold ${fulfillmentType === 'pickup' ? 'border-lime text-lime' : 'border-surface-3 text-muted'}`}>Самовывоз</button>
          </div>
          <textarea data-testid="b2b-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Срок поставки, требования к документам" className="mt-3 min-h-[84px] w-full rounded-[10px] border border-surface-3 bg-ink-dark p-3 text-sm outline-none placeholder:text-faint focus:border-lime" />
        </section>

        {message && <p className="text-center text-sm text-lime" role="status">{message}</p>}
        <button data-testid="b2b-submit" type="submit" disabled={busy || lines.some((line) => !line.sku)} className="w-full rounded-[13px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:opacity-50">{busy ? 'Отправляем…' : 'Запросить оптовое предложение'}</button>
      </form>

      {quotes.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-base font-bold">Мои заявки</h2>
          {quotes.map((quote) => (
            <article key={quote.id} className="mb-2.5 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">#{quote.id.slice(-8)}</span>
                <span className="rounded-md bg-lime/15 px-2 py-1 text-[10px] font-bold text-lime">{STATUS[quote.status]}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{quote.items.map((item) => `${item.name} × ${item.qty}`).join(', ')}</div>
              <div className="mt-1 text-xs text-subtle">Розница {som(quote.listTotal)} · {quote.paymentIntent === 'invoice' ? 'счёт' : 'перевод'}</div>
              {quote.quotedTotal !== null && <div className="mt-2 font-display text-lg font-extrabold text-lime">КП: {som(quote.quotedTotal)}</div>}
              {quote.staffNote && <p className="mt-1 text-xs text-muted">{quote.staffNote}</p>}
              {quote.status === 'quoted' && <button type="button" disabled={busy} onClick={() => accept(quote.id)} className="mt-3 w-full rounded-[9px] bg-lime py-2.5 text-xs font-bold text-lime-ink">Принять предложение</button>}
            </article>
          ))}
        </section>
      )}
    </MobileAppFrame>
  );
}

function Input({
  testId,
  label,
  value,
  onChange,
  type = 'text',
  required = true,
}: {
  testId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-[12px] text-muted">
      {label}
      <input data-testid={testId} required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-[10px] border border-surface-3 bg-ink-dark px-3 py-3 text-sm text-white outline-none focus:border-lime" />
    </label>
  );
}
