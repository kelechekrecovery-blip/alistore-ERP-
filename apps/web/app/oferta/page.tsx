import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { fetchPublicOffer } from '@/lib/api/legal';

/**
 * noindex ровно до публикации: заготовка не должна попадать в поиск как
 * действующая оферта магазина, а настоящий документ — должен.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { published } = await fetchPublicOffer();
  return {
    title: 'Публичная оферта — AliStore',
    description: published
      ? 'Договор публичной оферты AliStore.'
      : 'Договор публичной оферты AliStore готовится к публикации.',
    robots: published ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: '1. Общие положения',
    body: [
      'Настоящий документ является проектом договора публичной оферты [Наименование компании] и будет заполнен после юридической проверки.',
      'Понятия и термины, используемые в договоре: [Термины и определения].',
    ],
  },
  {
    title: '2. Предмет договора',
    body: [
      'Предмет договора будет сформулирован в финальной редакции документа.',
      '[Предмет договора]',
    ],
  },
  {
    title: '3. Оформление заказа',
    body: [
      'Порядок оформления и подтверждения заказа: [Порядок оформления заказа].',
    ],
  },
  {
    title: '4. Цена и порядок оплаты',
    body: [
      'Условия о цене товара и порядке оплаты будут описаны после юридической проверки.',
      '[Цена и порядок оплаты]',
    ],
  },
  {
    title: '5. Доставка и получение товара',
    body: [
      'Условия доставки, самовывоза и передачи товара: [Условия доставки и получения].',
    ],
  },
  {
    title: '6. Возврат и обмен товара',
    body: [
      'Порядок возврата и обмена товара будет определён в финальной редакции документа.',
      '[Порядок возврата и обмена]',
    ],
  },
  {
    title: '7. Ответственность сторон',
    body: [
      'Ответственность сторон и порядок разрешения споров: [Ответственность сторон], [Порядок разрешения споров].',
    ],
  },
  {
    title: '8. Срок действия и изменение оферты',
    body: [
      'Срок действия оферты и порядок её изменения: [Срок действия и порядок изменения оферты].',
    ],
  },
  {
    title: '9. Реквизиты продавца',
    body: [
      '[Наименование компании]',
      '[Реквизиты]',
      '[Адрес], [E-mail], [Телефон]',
    ],
  },
];

/**
 * Текст оферты владелец вставляет в ERP (`legal.offer_text`).
 *
 * Разработчик его не пишет: здесь реквизиты компании, которые нельзя ни
 * выдумать, ни зашить в код. Пока документа нет, страница честно говорит об
 * этом и показывает шаблон разделов как план — а не выдаёт его за действующий
 * договор. `SECTIONS` остаётся именно как план.
 */
export default async function OfertaPage() {
  const { text, published } = await fetchPublicOffer();

  if (published) {
    return (
      <div className="min-h-screen bg-[#0b0a08] text-[#e5dcd3]">
        <SiteHeader variant="design3" />
        <main className="mx-auto max-w-[1100px] px-5 py-12">
          <div className="text-xs text-white/40">
            <Link href="/">Главная</Link> / Публичная оферта
          </div>
          <h1 className="mt-5 break-words text-3xl font-extrabold leading-tight text-white sm:text-[38px]">Публичная оферта</h1>
          {/* Документ печатаем как есть, абзацами: владелец вставляет готовый
              текст, и переписывать его вёрсткой нельзя. */}
          {text.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="mt-4 max-w-[75ch] whitespace-pre-line text-base leading-7 text-white/70">
              {paragraph}
            </p>
          ))}
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0a08] text-[#e5dcd3]">
      <SiteHeader variant="design3" />
      <div className="border-b border-[#e5b23c]/40 bg-[#e5b23c]/10 px-5 py-3 text-center text-sm font-bold text-[#e5b23c]">
        Документ готовится — действующей оферты пока нет
      </div>
      <main className="mx-auto max-w-[1100px] px-5 py-12">
        <div className="text-xs text-white/40">
          <Link href="/">Главная</Link> / Публичная оферта
        </div>
        <h1 className="mt-5 break-words text-3xl font-extrabold leading-tight text-white sm:text-[38px]">Публичная оферта</h1>
        <p className="mt-3 max-w-[75ch] text-sm text-white/50">
          Текст договора ещё не опубликован. Ниже — план разделов будущего документа;
          он не является офертой и не создаёт обязательств. Условия конкретной покупки
          уточняйте у продавца до оплаты.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-[75ch] text-base leading-7 text-white/55">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
