import OrderStatusPage from './OrderStatusClient';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OrderStatusPage params={await params} />;
}
