'use client';

import { useEffect, useState } from 'react';
import { fetchSettings, saveSetting, type BusinessSetting } from '@/lib/api/settings';
import { Card } from './Card';

const GROUPS: { id: BusinessSetting['group']; title: string; note: string }[] = [
  { id: 'discounts', title: 'Скидки и согласования', note: 'Пороги, за которыми продажа уходит на одобрение.' },
  { id: 'payroll', title: 'Зарплата', note: 'Пока действует одинаково для всех сотрудников.' },
  { id: 'credit', title: 'Кредит и рассрочка', note: 'Лимит на один долг; совокупная экспозиция клиента не проверяется.' },
  { id: 'tradein', title: 'Trade-in', note: 'Экономика выкупа Б/У.' },
  { id: 'warranty', title: 'Гарантия', note: 'Печатается в гарантийном талоне.' },
  { id: 'loyalty', title: 'Бонусы', note: 'Начисление за покупку.' },
];

/** Human form of a stored integer: bps read as percent, everything else as-is. */
function display(setting: BusinessSetting): string {
  if (setting.kind === 'bps') return `${(setting.value / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  return `${setting.value.toLocaleString('ru-RU')} ${setting.unit}`;
}

export function SettingsView({ accessToken, canEdit }: { accessToken: string; canEdit: boolean }) {
  const [settings, setSettings] = useState<BusinessSetting[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  async function load() {
    try {
      const rows = await fetchSettings(accessToken);
      setSettings(rows);
      setError('');
    } catch (cause) {
      setSettings(null);
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить параметры');
    }
  }

  useEffect(() => { void load(); }, [accessToken]);

  async function save(setting: BusinessSetting) {
    const draft = drafts[setting.key];
    if (draft === undefined || draft.trim() === String(setting.value)) return;
    setBusy(setting.key);
    setError('');
    try {
      await saveSetting(setting.key, draft.trim(), accessToken);
      setDrafts((current) => { const next = { ...current }; delete next[setting.key]; return next; });
      setToast(`${setting.label} — сохранено`);
      window.setTimeout(() => setToast(''), 2600);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Параметр не сохранён');
    } finally {
      setBusy('');
    }
  }

  if (error && !settings) {
    return (
      <Card className="p-5">
        <p className="text-sm text-danger-soft">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-[8px] border border-surface-3 px-3 py-1.5 text-xs font-semibold text-white">Повторить</button>
      </Card>
    );
  }
  if (!settings) return <Card className="p-5"><p className="text-sm text-muted">Загрузка…</p></Card>;

  return (
    <div className="space-y-3.5">
      <Card className="p-5">
        <div className="font-display text-[15px] font-bold text-white">Параметры бизнеса</div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Значения, которые раньше были константами в коде: изменить оклад или потолок скидки можно
          здесь, без правки кода и выкатки. Каждое изменение пишется в Event Ledger вместе с прежним
          значением. Параметр без пометки «изменён» работает на исходной константе.
          {!canEdit && ' У вашей роли доступ только на чтение — менять может владелец.'}
        </p>
      </Card>

      {error && <Card className="p-4"><p role="alert" className="text-sm text-danger-soft">{error}</p></Card>}

      {GROUPS.map((group) => {
        const rows = settings.filter((setting) => setting.group === group.id);
        if (rows.length === 0) return null;
        return (
          <Card key={group.id} className="p-5">
            <div className="font-display text-[14px] font-bold text-white">{group.title}</div>
            <p className="mt-0.5 text-[11px] text-subtle">{group.note}</p>
            <div className="mt-3 flex flex-col gap-3">
              {rows.map((setting) => {
                const draft = drafts[setting.key] ?? String(setting.value);
                const dirty = draft.trim() !== String(setting.value);
                return (
                  <div key={setting.key} data-testid={`setting-${setting.key}`} className="grid gap-2 border-t border-surface-2 pt-3 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-white">{setting.label}</span>
                        <span className="rounded-chip bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-subtle">{display(setting)}</span>
                        {setting.overridden
                          ? <span className="rounded-chip bg-lime/15 px-2 py-0.5 text-[10px] font-semibold text-lime">изменён</span>
                          : <span className="rounded-chip bg-surface-2 px-2 py-0.5 text-[10px] text-subtle">по умолчанию {setting.fallback}</span>}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted">{setting.hint}</p>
                      {setting.updatedAt && (
                        <p className="mt-0.5 text-[10px] text-subtle">
                          изменил {setting.updatedBy} · {new Date(setting.updatedAt).toLocaleString('ru-RU')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={setting.label}
                        value={draft}
                        disabled={!canEdit || busy === setting.key}
                        inputMode="numeric"
                        onChange={(event) => setDrafts({ ...drafts, [setting.key]: event.target.value })}
                        className="h-9 w-28 rounded-[7px] border border-surface-3 bg-surface-2 px-2.5 text-right font-mono text-sm text-white outline-none focus:border-coral disabled:opacity-50"
                      />
                      <span className="w-16 text-[11px] text-subtle">{setting.unit}</span>
                      <button
                        type="button"
                        disabled={!canEdit || !dirty || busy === setting.key}
                        onClick={() => void save(setting)}
                        className="h-9 rounded-[7px] bg-coral px-3 text-xs font-bold text-white disabled:bg-surface-2 disabled:text-subtle"
                      >
                        {busy === setting.key ? '…' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-lime px-5 py-2.5 text-sm font-semibold text-lime-ink shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
