import Link from 'next/link';
import { CartButton } from './CartButton';
import { AuthNav } from './AuthNav';

const NAV = [
  { href: '/', label: 'Каталог' },
  { href: '/trade-in', label: 'Скупка Б/У' },
  { href: '/#warranty', label: 'Гарантия' },
  { href: '/support', label: 'Поддержка' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-sand/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="AliStore — на главную">
          <span className="grid h-8 w-8 place-items-center rounded-btn bg-coral font-display text-lg font-extrabold text-white shadow-soft">
            A
          </span>
          <span className="font-display text-lg font-extrabold text-ink">
            Ali<span className="text-coral">Store</span>
          </span>
        </Link>

        <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-btn px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-tint hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <AuthNav />
          <CartButton />
        </div>
      </div>
    </header>
  );
}
