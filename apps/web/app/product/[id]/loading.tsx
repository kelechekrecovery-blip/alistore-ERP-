import { SiteHeader } from "@/components/SiteHeader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0b0a08] font-sans text-white" role="status" aria-live="polite">
      <SiteHeader variant="design3" />
      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <h1 className="sr-only">Загружаем товар</h1>
        <p className="mb-4 text-sm text-white/60">Загружаем информацию о товаре...</p>
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14" aria-hidden="true">
          <div className="aspect-square max-h-[610px] animate-pulse rounded-[22px] border border-white/10 bg-white/[.04]" />
          <div className="space-y-4 pt-1">
            <div className="h-4 w-24 animate-pulse rounded-full bg-linen" />
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-linen" />
            <div className="h-4 w-40 animate-pulse rounded-full bg-linen" />
            <div className="h-10 w-48 animate-pulse rounded-lg bg-linen" />
            <div className="h-12 w-full animate-pulse rounded-btn bg-linen" />
          </div>
        </div>
      </main>
    </div>
  );
}
