import { Headphones, Laptop, Package, Smartphone, Tablet, Tv, Watch } from 'lucide-react';

function productIcon(category: string) {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('смартф') || normalized.includes('телефон') || normalized.includes('phone')) return Smartphone;
  if (normalized.includes('ноут') || normalized.includes('laptop') || normalized.includes('macbook')) return Laptop;
  if (normalized.includes('планш') || normalized.includes('tablet')) return Tablet;
  if (normalized.includes('аудио') || normalized.includes('науш') || normalized.includes('audio')) return Headphones;
  if (normalized.includes('час') || normalized.includes('watch')) return Watch;
  if (normalized.includes('телев') || normalized.includes('tv')) return Tv;
  return Package;
}

/**
 * Category-aware empty media state. It avoids drawing a specific product:
 * only an approved photo may represent the model, colour and condition.
 */
export function ProductVisualFallback({ category, dark = true, compact = false }: { category: string; dark?: boolean; compact?: boolean }) {
  const Icon = productIcon(category);
  return (
    <span
      role="img"
      aria-label="Изображение товара недоступно: фото готовится"
      data-testid="product-visual-fallback"
      data-category={category}
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden ${dark ? 'bg-[radial-gradient(circle_at_50%_38%,rgba(255,122,77,.18),transparent_42%)] text-white/55' : 'bg-[radial-gradient(circle_at_50%_38%,rgba(255,91,46,.12),transparent_44%)] text-steel'}`}
    >
      <span aria-hidden="true" className={`absolute h-[46%] w-[46%] rounded-full border ${dark ? 'border-white/[.06]' : 'border-coral/10'}`} />
      <span aria-hidden="true" className={`relative grid place-items-center border shadow-lg ${compact ? 'h-10 w-10 rounded-[13px]' : 'h-14 w-14 rounded-[18px]'} ${dark ? 'border-white/10 bg-white/[.06] text-[#ff9a6e] shadow-black/30' : 'border-coral/15 bg-white/75 text-coral shadow-coral/10'}`}>
        <Icon size={compact ? 21 : 27} strokeWidth={1.65} />
      </span>
      {!compact && <span aria-hidden="true" className={`relative mt-3 text-[10px] font-bold uppercase tracking-[.14em] ${dark ? 'text-white/55' : 'text-steel'}`}>AliStore</span>}
      <span aria-hidden="true" className={`relative text-[10px] font-medium ${compact ? 'mt-2' : 'mt-1'} ${dark ? 'text-white/70' : 'text-ink/75'}`}>Фото готовится</span>
    </span>
  );
}

/** Abstract category composition for a hero without an uploaded campaign image. */
export function StorefrontHeroVisualFallback() {
  return (
    <span aria-hidden="true" data-testid="storefront-hero-visual-fallback" className="absolute bottom-8 right-8 hidden h-[230px] w-[260px] lg:block">
      <span className="absolute bottom-0 right-4 grid h-[190px] w-[116px] place-items-center rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[.09] to-white/[.025] text-[#ff9a6e] shadow-2xl shadow-black/40 backdrop-blur">
        <Smartphone size={56} strokeWidth={1.25} />
      </span>
      <span className="absolute bottom-2 left-0 grid h-[122px] w-[156px] place-items-center rounded-[22px] border border-white/10 bg-gradient-to-br from-white/[.08] to-black/10 text-white/45 shadow-xl shadow-black/30 backdrop-blur">
        <Laptop size={58} strokeWidth={1.15} />
      </span>
      <span className="absolute right-0 top-0 grid h-[70px] w-[70px] place-items-center rounded-full border border-[#ff7a4d]/20 bg-[#ff7a4d]/10 text-[#ff9a6e]">
        <Headphones size={30} strokeWidth={1.35} />
      </span>
    </span>
  );
}
