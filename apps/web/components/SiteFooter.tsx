import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[#2E2822] bg-[#16130F]">
      <div className="mx-auto grid w-[min(1200px,92vw)] gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display font-bold text-white">A</span>
            <strong className="font-display text-lg text-white">ALISTORE</strong>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#A79C92]">Официальная техника, проверенные Б/У устройства и честная гарантия. Доставка по Бишкеку и всей Кыргызской Республике.</p>
        </div>
        <FooterColumn title="Покупателям" links={[["Каталог", "/catalog"], ["Trade-in", "/trade-in"], ["Гарантия", "/warranty"], ["Поддержка", "/support"]]} />
        <FooterColumn title="Аккаунт" links={[["Кабинет", "/account"], ["Заказы", "/account"], ["Избранное", "/favorites"], ["Бонусы", "/account/bonuses"]]} />
        <div>
          <h3 className="text-sm font-semibold text-white">Контакты</h3>
          <p className="mt-4 text-sm text-[#D8CFC6]">Бишкек, Кыргызстан</p>
          <p className="mt-2 text-sm text-[#D8CFC6]">Ежедневно, 10:00–21:00</p>
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
