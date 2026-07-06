export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink/10">
      <div className="mx-auto flex w-full max-w-content flex-col gap-2 px-4 py-10 sm:px-6">
        <p className="font-display text-sm font-bold text-ink">AliStore · Бишкек</p>
        <p className="max-w-md text-sm text-ink/60">
          Электроника новое и Б/У с гарантией. Проверка по IMEI, честная цена,
          скупка и trade-in. Оплата: наличные, карта, QR MBank / O!Деньги, рассрочка 0-0-12.
        </p>
        <p className="mt-2 font-mono text-xs text-ink/40">© 2026 AliStore.kg</p>
      </div>
    </footer>
  );
}
