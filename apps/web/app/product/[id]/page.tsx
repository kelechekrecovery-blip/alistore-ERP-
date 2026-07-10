import ProductPage from './ProductClient';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProductPage params={await params} />;
}
