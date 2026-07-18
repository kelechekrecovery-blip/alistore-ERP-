'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { fetchStorefrontContent, type StorefrontPayload } from '@/lib/api';

export function StorefrontInfoPage({ kind }: { kind: 'about' | 'delivery' }) {
  const [payload, setPayload] = useState<StorefrontPayload | null | 'error'>(null);
  useEffect(() => { fetchStorefrontContent().then((value) => setPayload(value ?? 'error')); }, []);
  const content = payload && payload !== 'error' ? payload.content : null;
  const title = kind === 'about' ? content?.aboutTitle : content?.deliveryTitle;
  const body = kind === 'about' ? content?.aboutBody : content?.deliveryBody;
  return <div className="min-h-screen bg-paper text-coal"><SiteHeader /><main className="mx-auto max-w-[1100px] px-5 py-12"><div className="text-xs text-slate"><Link href="/">Главная</Link> / {kind === 'about' ? 'О компании' : 'Доставка и оплата'}</div><h1 className="mt-5 text-[38px] font-extrabold">{title ?? (payload === null ? 'Загрузка...' : 'Информация временно недоступна')}</h1>{body && <p className="mt-6 max-w-[75ch] whitespace-pre-line text-base leading-7 text-steel">{body}</p>}{payload !== 'error' && payload !== null && payload.stores.length > 0 && <section className="mt-12"><h2 className="text-2xl font-bold">Точки AliStore</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{payload.stores.map((store) => <article key={store.id} className="rounded-[8px] border border-mist bg-white p-5"><h3 className="font-bold">{store.name}</h3><p className="mt-2 text-sm text-steel">{store.address}</p><p className="mt-1 text-sm text-slate">{store.hours}</p></article>)}</div></section>}</main><SiteFooter /></div>;
}
