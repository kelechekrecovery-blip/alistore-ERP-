import ProductPage from './ProductClient';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { id: string } }) {
  return <ProductPage params={params} />;
}
