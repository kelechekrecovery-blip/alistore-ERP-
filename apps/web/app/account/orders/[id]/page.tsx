import OrderDetailPage from './OrderDetailClient';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OrderDetailPage params={await params} />;
}
