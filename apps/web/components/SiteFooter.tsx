'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStorefrontContent, type StorefrontPayload } from '@/lib/api';

export function SiteFooter() {
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  useEffect(() => { fetchStorefrontContent().then(setStorefront); }, []);
  const point = storefront?.stores[0];
  return (
    <footer className="mt-24 border-t border-[#2E2822] bg-[#16130F]">
      <div className="mx-auto grid w-[min(1200px,92vw)] gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display font-bold text-white">A</span>
            <strong className="font-display text-lg text-white">ALISTORE</strong>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#A79C92]">{storefront?.content.aboutBody ?? 'Каталог, заказ, получение и сервис AliStore.'}</p>
        </div>
        <FooterColumn title="Покупателям" links={[["Каталог", "/catalog"], ["Trade-in", "/trade-in"], ["Гарантия", "/warranty"], ["Поддержка", "/support"]]} />
        <FooterColumn title="Аккаунт" links={[["Кабинет", "/account"], ["Заказы", "/account"], ["Избранное", "/favorites"], ["Бонусы", "/account/bonuses"]]} />
        <FooterColumn title="Документы" links={[["Политика конфиденциальности", "/privacy"], ["Публичная оферта", "/oferta"]]} />
        <div>
          <h3 className="text-sm font-semibold text-white">Контакты</h3>
          {point && <><p className="mt-4 text-sm text-[#D8CFC6]">{point.address}</p><p className="mt-2 text-sm text-[#D8CFC6]">{point.hours}</p></>}
          {storefront?.content.contactPhone && <a href={`tel:${storefront.content.contactPhone.replace(/\s/g, '')}`} className="mt-2 block text-sm text-[#D8CFC6]">{storefront.content.contactPhone}</a>}
          <Link href="/support" className="mt-4 inline-block text-sm text-[#FF8A5F]">Написать в поддержку</Link>
        </div>
      </div>
      <div className="border-t border-[#2E2822] py-5 text-center text-xs text-[#8A7F76]">© 2026 AliStore · Электроника · Кыргызстан</div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return <div><h3 className="text-sm font-semibold text-white">{title}</h3><div className="mt-4 grid gap-2.5">{links.map(([label, href]) => <Link key={href + label} href={href} className="text-sm text-[#D8CFC6] transition hover:text-[#FF8A5F]">{label}</Link>)}</div></div>;
}
