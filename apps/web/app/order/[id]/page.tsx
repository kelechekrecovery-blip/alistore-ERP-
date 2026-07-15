import GuestOrderStatus from './GuestOrderStatus';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <GuestOrderStatus orderId={(await params).id} />;
}
