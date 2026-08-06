import type { Metadata } from 'next';
import BusinessCabinet from './BusinessCabinet';

export const metadata: Metadata = {
  title: 'AliStore Business — кабинет магазина',
  description: 'Кабинет магазина-партнёра AliStore Ecosystem: свой ассортимент и цены.',
  // Кабинет — рабочий инструмент партнёра, а не страница витрины: в поиске ему
  // делать нечего, а форма входа в выдаче только собирает переборщиков.
  robots: { index: false, follow: false },
};

export default function BusinessPage() {
  return <BusinessCabinet />;
}
