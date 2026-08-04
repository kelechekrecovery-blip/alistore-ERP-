import WarrantyCertificatePage from './WarrantyCertificateClient';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ imei: string }> }) {
  return <WarrantyCertificatePage params={await params} />;
}
