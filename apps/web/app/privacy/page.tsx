import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — AliStore',
  description: 'Политика обработки персональных данных AliStore.',
};

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: '1. Общие положения',
    body: [
      'Настоящая политика конфиденциальности описывает порядок обработки персональных данных пользователей сайта и сервисов [Наименование компании].',
      'Текст документа является заготовкой и будет заполнен после юридической проверки.',
    ],
  },
  {
    title: '2. Оператор персональных данных',
    body: [
      'Оператор персональных данных: [Наименование компании], [Организационно-правовая форма], [Реквизиты], [Адрес].',
      'Контакт для обращений по вопросам персональных данных: [E-mail], [Телефон].',
    ],
  },
  {
    title: '3. Состав обрабатываемых данных',
    body: [
      'Перечень категорий персональных данных, обрабатываемых оператором, будет определён в финальной редакции документа.',
      '[Перечень категорий данных]',
    ],
  },
  {
    title: '4. Цели обработки',
    body: [
      'Цели обработки персональных данных будут сформулированы после юридической проверки.',
      '[Цели обработки]',
    ],
  },
  {
    title: '5. Правовые основания обработки',
    body: [
      'Правовые основания обработки персональных данных: [Правовые основания].',
    ],
  },
  {
    title: '6. Передача данных третьим лицам',
    body: [
      'Условия и случаи передачи персональных данных третьим лицам будут описаны в финальной редакции документа.',
      '[Перечень третьих лиц и условия передачи]',
    ],
  },
  {
    title: '7. Хранение и защита данных',
    body: [
      'Сроки хранения и меры защиты персональных данных: [Сроки хранения], [Меры защиты].',
    ],
  },
  {
    title: '8. Права субъекта персональных данных',
    body: [
      'Права пользователя как субъекта персональных данных и порядок их реализации будут описаны после юридической проверки.',
      '[Порядок реализации прав субъекта данных]',
    ],
  },
  {
    title: '9. Изменение политики',
    body: [
      'Порядок внесения изменений в настоящую политику: [Порядок изменения документа].',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0b0a08] text-[#e5dcd3]">
      <SiteHeader variant="design3" />
      <div className="border-b border-[#e5b23c]/40 bg-[#e5b23c]/10 px-5 py-3 text-center text-sm font-bold text-[#e5b23c]">
        ЧЕРНОВИК — текст требует проверки юристом
      </div>
      <main className="mx-auto max-w-[1100px] px-5 py-12">
        <div className="text-xs text-white/40">
          <Link href="/">Главная</Link> / Политика конфиденциальности
        </div>
        <h1 className="mt-5 break-words text-3xl font-extrabold leading-tight text-white sm:text-[38px]">Политика конфиденциальности</h1>
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
