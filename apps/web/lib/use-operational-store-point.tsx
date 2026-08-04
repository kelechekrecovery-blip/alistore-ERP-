'use client';

import { useEffect, useState } from 'react';
import { fetchCheckoutOptions, staffAuthMe, type StorePoint } from './api';

/**
 * Operational location identity. Non-owner staff are pinned to the active
 * StorePoint returned by /staff-auth/me; owner/admin must select explicitly.
 */
export function useOperationalStorePoint(accessToken: string) {
  const [points, setPoints] = useState<StorePoint[]>([]);
  const [point, setPoint] = useState('');
  const [canSelect, setCanSelect] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      staffAuthMe(accessToken),
      fetchCheckoutOptions(new Date().toISOString().slice(0, 10)),
    ]).then(([profile, options]) => {
      if (!active) return;
      const available = options.pickupPoints;
      const assigned = available.find((item) => item.id === profile.storePoint.id);
      if (!assigned) throw new Error('Назначенная точка отключена или недоступна');
      const manager = profile.role === 'owner' || profile.role === 'admin';
      setPoints(available);
      setCanSelect(manager);
      setPoint(manager ? '' : assigned.inventoryLocation);
    }).catch((cause) => {
      if (active) {
        setPoints([]);
        setPoint('');
        setError(cause instanceof Error ? cause.message : 'Не удалось определить рабочую точку');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [accessToken]);

  return { points, point, setPoint, canSelect, error, loading };
}

export function OperationalStorePointSelect({
  points,
  point,
  setPoint,
  canSelect,
  label = 'Точка',
}: {
  points: StorePoint[];
  point: string;
  setPoint: (point: string) => void;
  canSelect: boolean;
  label?: string;
}) {
  return (
    <label className="text-[10px] text-subtle">
      {label}
      <select
        aria-label={label}
        required
        value={point}
        disabled={!canSelect}
        onChange={(event) => setPoint(event.target.value)}
        className="mt-1 block h-9 min-w-40 rounded-[6px] border border-line bg-surface px-2 text-xs text-white disabled:opacity-70"
      >
        {canSelect && <option value="" disabled>Выберите точку</option>}
        {points.map((item) => (
          <option key={item.id} value={item.inventoryLocation}>
            {item.name} · {item.inventoryLocation}
          </option>
        ))}
      </select>
    </label>
  );
}
