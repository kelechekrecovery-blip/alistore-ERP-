import OrderStatusPage from './OrderStatusClient';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { id: string } }) {
  return <OrderStatusPage params={params} />;
}
