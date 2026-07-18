import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Публичная оферта — AliStore',
  description: 'Договор публичной оферты AliStore.',
};

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

export default function OfertaPage() {
  return (
    <div className="min-h-screen bg-sand text-ink">
      <SiteHeader />
      <div className="border-b border-[#e8c547] bg-[#fff3cd] px-5 py-3 text-center text-sm font-bold text-[#7a5c00]">
        ЧЕРНОВИК — текст требует проверки юристом
      </div>
      <main className="mx-auto max-w-[1100px] px-5 py-12">
        <div className="text-xs text-faint">
          <Link href="/">Главная</Link> / Публичная оферта
        </div>
        <h1 className="mt-5 text-[38px] font-extrabold">Публичная оферта</h1>
        <p className="mt-3 max-w-[75ch] text-sm text-faint">
          Редакция от [Дата]. Настоящий документ размещён в ознакомительных целях и не является
          окончательной версией.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="text-xl font-bold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 max-w-[75ch] text-base leading-7 text-faint">
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
