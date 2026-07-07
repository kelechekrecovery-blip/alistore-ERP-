import OrderDetailPage from './OrderDetailClient';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { id: string } }) {
  return <OrderDetailPage params={params} />;
}
