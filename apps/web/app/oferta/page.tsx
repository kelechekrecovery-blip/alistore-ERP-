import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Публичная оферта — AliStore',
  description: 'Договор публичной оферты AliStore.',
  // Пока документ состоит из плейсхолдеров ([Предмет договора], [Реквизиты], [Дата]),
  // он не должен попадать в поиск как действующая оферта магазина. Баннер «ЧЕРНОВИК»
  // предупреждает человека, а noindex — поисковик. Снять оба разом, когда владелец
  // даст финальный текст и реквизиты.
  robots: { index: false, follow: false },
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
    <div className="min-h-screen bg-[#0b0a08] text-[#e5dcd3]">
      <SiteHeader variant="design3" />
      <div className="border-b border-[#e5b23c]/40 bg-[#e5b23c]/10 px-5 py-3 text-center text-sm font-bold text-[#e5b23c]">
        ЧЕРНОВИК — текст требует проверки юристом
      </div>
      <main className="mx-auto max-w-[1100px] px-5 py-12">
        <div className="text-xs text-white/40">
          <Link href="/">Главная</Link> / Публичная оферта
        </div>
        <h1 className="mt-5 break-words text-3xl font-extrabold leading-tight text-white sm:text-[38px]">Публичная оферта</h1>
        <p className="mt-3 max-w-[75ch] text-sm text-white/50">
          Редакция от [Дата]. Настоящий документ размещён в ознакомительных целях и не является
          окончательной версией.
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
