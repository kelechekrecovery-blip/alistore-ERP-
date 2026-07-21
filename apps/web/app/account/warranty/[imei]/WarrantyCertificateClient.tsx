'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchMyDevices, type MyDevice } from '@/lib/api';
import { WarrantyCertificate } from '@/components/WarrantyCertificate';
import { AccountDetailFrame } from '@/components/AccountDetailFrame';

export default function WarrantyCertificatePage({ params }: { params: { imei: string } }) {
  const imei = decodeURIComponent(params.imei);
  const { user, hydrated, authed } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<MyDevice[] | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (hydrated && !user) router.replace(`/login?next=/account/warranty/${encodeURIComponent(imei)}`);
  }, [hydrated, user, router, imei]);
  useEffect(() => {
    // `setDevices([])` выдавал «Устройство не найдено» — владелец гарантийного
    // телефона решал, что гарантия не оформлена, хотя список не загрузился.
    if (user) { setLoadError(''); authed(fetchMyDevices).then(setDevices).catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить устройства')); }
  }, [user, authed]);

  if (!hydrated || !user) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-ink-dark font-mono text-sm text-subtle">Загрузка…</div>;
  }

  const device = devices?.find((d) => d.imei === imei) ?? null;

  return (
    <AccountDetailFrame>
        <div className="flex items-center gap-3 px-4 pb-3 pt-5">
          <button type="button" onClick={() => router.back()} className="text-xl">←</button>
          <span className="font-display text-xl font-bold">Гарантия</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {loadError && (
            <div className="py-12 text-center">
              <div className="mt-3.5 font-display text-[17px] font-bold">Устройства не загрузились</div>
              <p className="mt-2 text-sm text-subtle">{loadError}</p>
              <p className="mt-1 text-sm text-muted">Это не значит, что гарантии нет — список не пришёл.</p>
              <Link href="/account/devices" className="mt-4 inline-block text-sm text-lime">← Мои устройства</Link>
            </div>
          )}
          {!loadError && devices === null && <p className="font-mono text-sm text-subtle">Загрузка…</p>}
          {!loadError && devices !== null && !device && (
            <div className="py-12 text-center">
              <div className="text-5xl">🔍</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Устройство не найдено</div>
              <Link href="/account/devices" className="mt-4 inline-block text-sm text-lime">← Мои устройства</Link>
            </div>
          )}
          {device && <WarrantyCertificate device={device} customerId={user.customerId} />}
        </div>
    </AccountDetailFrame>
  );
}
