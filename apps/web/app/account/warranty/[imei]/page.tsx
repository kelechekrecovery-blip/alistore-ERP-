import WarrantyCertificatePage from './WarrantyCertificateClient';

export const dynamic = 'force-dynamic';

export default function Page({ params }: { params: { imei: string } }) {
  return <WarrantyCertificatePage params={params} />;
}
