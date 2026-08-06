'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchFeatureFlags,
  resetFeatureFlag,
  setFeatureFlag,
  type FeatureFlagKey,
  type FeatureFlagState,
} from '@/lib/api/feature-flags';
import { Card } from './Card';
import { ApiError } from '@/lib/api/http';

type PendingMutation = {
  key: FeatureFlagKey;
  action: 'set' | 'reset';
  enabled?: boolean;
};

const SOURCE_LABEL: Record<FeatureFlagState['source'], string> = {
  database: 'override базы',
  environment: 'deploy env',
  default: 'безопасный default',
};

export function FeatureFlagsView({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  const [flags, setFlags] = useState<FeatureFlagState[] | null>(null);
  const [reasons, setReasons] = useState<Partial<Record<FeatureFlagKey, string>>>({});
  const [pending, setPending] = useState<PendingMutation | null>(null);
  const [busy, setBusy] = useState<FeatureFlagKey | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setFlags(await fetchFeatureFlags(accessToken));
    } catch (cause) {
      setFlags(null);
      setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить feature flags');
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  async function confirmMutation() {
    if (!pending) return;
    const reason = reasons[pending.key]?.trim() ?? '';
    if (!reason) {
      setMutationError('Укажите причину изменения');
      return;
    }
    setBusy(pending.key);
    setMutationError('');
    setNotice('');
    try {
      const current = flags?.find((flag) => flag.key === pending.key);
      if (!current) throw new Error('Feature flag state is unavailable; refresh and retry');
      const next = pending.action === 'reset'
        ? await resetFeatureFlag(pending.key, reason, current.overrideRevision, accessToken)
        : await setFeatureFlag(
          pending.key,
          Boolean(pending.enabled),
          reason,
          current.overrideRevision,
          accessToken,
        );
      setFlags((current) => current?.map((flag) => flag.key === next.key ? next : flag) ?? [next]);
      setReasons((current) => ({ ...current, [pending.key]: '' }));
      setNotice(pending.action === 'reset' ? 'Deploy-политика восстановлена' : 'Override применён без перезапуска');
      setPending(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        await load();
        setPending(null);
        setMutationError('Флаг уже изменён в другой вкладке. Состояние обновлено — проверьте его и подтвердите заново.');
      } else {
        setMutationError(cause instanceof Error ? cause.message : 'Изменение не применено');
      }
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <Card className="p-5">
        <p role="alert" className="text-sm text-danger-soft">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-[8px] border border-surface-3 px-3 py-1.5 text-xs font-semibold text-white">Повторить</button>
      </Card>
    );
  }

  if (!flags) return <Card className="p-5"><p className="text-sm text-muted">Загрузка feature flags…</p></Card>;

  const pendingFlag = pending ? flags.find((flag) => flag.key === pending.key) : undefined;

  return (
    <div className="space-y-4" data-testid="feature-flags-view">
      <Card className="p-5">
        <div className="font-display text-[15px] font-bold text-white">Серверные переключатели поставок</div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Приоритет: override базы → deploy env → безопасный default. Каждое изменение требует причину и записывается в Event Ledger.
          {!canManage && ' Ваша роль может просматривать состояние, но изменения доступны только владельцу.'}
        </p>
        {!canManage && <p role="status" className="mt-3 rounded-[8px] border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">Только чтение: требуется permission settings:manage.</p>}
      </Card>

      {mutationError && <Card className="p-4"><p role="alert" className="text-sm text-danger-soft">{mutationError}</p></Card>}
      {notice && <div role="status" className="rounded-[8px] border border-lime/30 bg-lime/10 px-4 py-2 text-sm text-lime">{notice}</div>}

      {flags.map((flag) => {
        const reason = reasons[flag.key] ?? '';
        return (
          <Card key={flag.key} className="p-5">
            <div data-testid={`feature-flag-${flag.key}`} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-sm font-semibold text-white">{flag.key}</code>
                  <span className={`rounded-chip px-2 py-0.5 text-[10px] font-bold ${flag.enabled ? 'bg-lime/15 text-lime' : 'bg-surface-2 text-muted'}`}>{flag.enabled ? 'включён' : 'выключен'}</span>
                  <span className="rounded-chip bg-surface-2 px-2 py-0.5 text-[10px] text-subtle">{SOURCE_LABEL[flag.source]}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">{flag.description}</p>
                <p className="mt-1 text-[10px] text-subtle">owner: {flag.owner} · legacy: {flag.legacyEnv}</p>
              </div>
              <div className="w-full lg:w-[360px]">
                <label className="text-[11px] font-semibold text-subtle" htmlFor={`feature-flag-reason-${flag.key}`}>Причина изменения</label>
                <input
                  id={`feature-flag-reason-${flag.key}`}
                  aria-label={`Причина ${flag.key}`}
                  value={reason}
                  disabled={!canManage || busy === flag.key}
                  onChange={(event) => setReasons((current) => ({ ...current, [flag.key]: event.target.value }))}
                  placeholder="Обязательная причина для Ledger"
                  className="mt-1 h-9 w-full rounded-[7px] border border-surface-3 bg-surface-2 px-3 text-xs text-white outline-none focus:border-coral disabled:opacity-50"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={!canManage || !reason.trim() || busy === flag.key || flag.enabled} onClick={() => setPending({ key: flag.key, action: 'set', enabled: true })} className="rounded-[7px] bg-lime px-3 py-2 text-xs font-bold text-lime-ink disabled:bg-surface-2 disabled:text-subtle">Включить</button>
                  <button type="button" disabled={!canManage || !reason.trim() || busy === flag.key || !flag.enabled} onClick={() => setPending({ key: flag.key, action: 'set', enabled: false })} className="rounded-[7px] bg-coral px-3 py-2 text-xs font-bold text-white disabled:bg-surface-2 disabled:text-subtle">Выключить</button>
                  <button type="button" disabled={!canManage || !reason.trim() || busy === flag.key || flag.source !== 'database'} onClick={() => setPending({ key: flag.key, action: 'reset' })} className="rounded-[7px] border border-surface-3 px-3 py-2 text-xs font-semibold text-white disabled:text-subtle">Сбросить к deploy default</button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {pending && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="feature-flag-confirm-title" className="w-full max-w-md rounded-[14px] border border-surface-3 bg-ink-dark p-5 shadow-2xl">
            <div id="feature-flag-confirm-title" className="font-display text-lg font-bold text-white">Подтвердите изменение</div>
            <p className="mt-2 text-sm text-muted">
              {pending.action === 'reset' && pendingFlag
                ? `Сброс отключит override и ${pendingFlag.fallback.enabled ? 'ВКЛЮЧИТ' : 'ВЫКЛЮЧИТ'} флаг через ${SOURCE_LABEL[pendingFlag.fallback.source]}.`
                : `${pending.key}: ${pending.enabled ? 'включить' : 'выключить'}.`}
            </p>
            <p className="mt-2 text-xs text-subtle">Причина: {reasons[pending.key]?.trim()}</p>
            {mutationError && <p role="alert" className="mt-3 text-sm text-danger-soft">{mutationError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy === pending.key} onClick={() => { setPending(null); setMutationError(''); }} className="rounded-[8px] border border-surface-3 px-4 py-2 text-xs font-semibold text-white">Отмена</button>
              <button type="button" disabled={busy === pending.key} onClick={() => void confirmMutation()} className="rounded-[8px] bg-coral px-4 py-2 text-xs font-bold text-white">{busy === pending.key ? 'Применяем…' : 'Подтвердить'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
