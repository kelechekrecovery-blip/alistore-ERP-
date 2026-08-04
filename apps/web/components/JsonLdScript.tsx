/**
 * Блок разметки schema.org. Намеренно без 'use client': разметку читают
 * поисковые роботы, а они не выполняют JS — значит она обязана уходить в
 * первичный HTML с сервера.
 *
 * Жил внутри `app/product/[id]/ProductClient.tsx` (модуль с 'use client'), из-за
 * чего Product/Offer/BreadcrumbList товара рождались только после гидратации.
 *
 * `<` экранируется, чтобы данные товара не могли закрыть тег и вырваться из
 * скрипта.
 */
export function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
