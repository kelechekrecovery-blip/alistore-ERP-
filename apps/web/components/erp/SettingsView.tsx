'use client';

import { useEffect, useState } from 'react';
import { fetchSettings, saveSetting, type BusinessSetting } from '@/lib/api/settings';
import { uploadImage } from '@/lib/api/media';
import { Card } from './Card';

const GROUPS: { id: BusinessSetting['group']; title: string; note: string }[] = [
  { id: 'discounts', title: 'Скидки и согласования', note: 'Пороги, за которыми продажа уходит на одобрение.' },
  { id: 'payroll', title: 'Зарплата', note: 'Пока действует одинаково для всех сотрудников.' },
  { id: 'credit', title: 'Кредит и рассрочка', note: 'Лимит на один долг; совокупная экспозиция клиента не проверяется.' },
  { id: 'tradein', title: 'Trade-in', note: 'Экономика выкупа Б/У.' },
  { id: 'warranty', title: 'Гарантия', note: 'Печатается в гарантийном талоне.' },
  { id: 'loyalty', title: 'Бонусы', note: 'Начисление за покупку.' },
  { id: 'legal', title: 'Юридические документы', note: 'Текст пишет юрист, а не разработчик. Пусто — документ на витрине не опубликован.' },
];

/** Human form of a stored integer: bps read as percent, everything else as-is. */
function display(setting: BusinessSetting): string {
  if (setting.kind === 'url') return setting.value === '' ? 'не задан' : 'загружен';
  if (setting.kind === 'text') {
    const length = String(setting.value).length;
    return length === 0 ? 'не опубликован' : `${length.toLocaleString('ru-RU')} символов`;
  }
  const numeric = Number(setting.value);
  if (setting.kind === 'bps') return `${(numeric / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  return `${numeric.toLocaleString('ru-RU')} ${setting.unit}`;
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

  /**
   * Загрузить QR провайдера: файл уходит в media, а в параметр пишется его URL.
   *
   * Два шага намеренно раздельны — если сохранение параметра не удастся, файл
   * уже лежит и повтор не потребует выбирать его заново.
   */
  async function uploadQr(setting: BusinessSetting, file: File) {
    setBusy(setting.key);
    setError('');
    try {
      const uploaded = await uploadImage(file, accessToken);
      await saveSetting(setting.key, uploaded.url, accessToken);
      setToast(`${setting.label} — QR загружен`);
      window.setTimeout(() => setToast(''), 2600);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'QR не загрузился');
    } finally {
      setBusy('');
    }
  }

  async function clearQr(setting: BusinessSetting) {
    setBusy(setting.key);
    setError('');
    try {
      // Пустая строка — это «снять QR», а не «сломанное значение»: блок «где
      // оформить» на витрине после этого просто перестаёт показываться.
      await saveSetting(setting.key, '', accessToken);
      setToast(`${setting.label} — QR снят`);
      window.setTimeout(() => setToast(''), 2600);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'QR не снят');
    } finally {
      setBusy('');
    }
  }

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
                        {/* Сохранённое, но невалидное значение молча заменялось
                            дефолтом, а чип продолжал говорить «изменён» — владелец
                            видел свою же фамилию и дату у цифры, которая на самом
                            деле не применяется. */}
                        {setting.corrupted
                          ? <span className="rounded-chip bg-danger-soft/15 px-2 py-0.5 text-[10px] font-semibold text-danger-soft">значение отброшено — действует дефолт</span>
                          : setting.overridden
                          ? <span className="rounded-chip bg-lime/15 px-2 py-0.5 text-[10px] font-semibold text-lime">изменён</span>
                          : <span className="rounded-chip bg-surface-2 px-2 py-0.5 text-[10px] text-subtle">
                              {/* У строковых параметров дефолт — пустота, и
                                  «по умолчанию » с пустым хвостом читается как
                                  сломанная вёрстка. Называем состояние словом. */}
                              {setting.kind === 'url' || setting.kind === 'text' ? 'не заполнен' : `по умолчанию ${setting.fallback}`}
                            </span>}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted">{setting.hint}</p>
                      {setting.updatedAt && (
                        <p className="mt-0.5 text-[10px] text-subtle">
                          изменил {setting.updatedBy} · {new Date(setting.updatedAt).toLocaleString('ru-RU')}
                        </p>
                      )}
                    </div>
                    {/* Ссылочный параметр — это картинка (QR провайдера), и
                        просить владельца вписать сюда путь руками значило бы
                        заставить его сначала где-то захостить файл. Даём
                        загрузку и превью: видно, что именно уедет на витрину. */}
                    {setting.kind === 'text' ? (
                      // Документ — не строка в 28 пикселей: даём поле, в которое
                      // реально видно, что вставлено, и сохраняем явной кнопкой.
                      <div className="flex flex-col items-stretch gap-2 md:w-[420px]">
                        <textarea
                          aria-label={setting.label}
                          value={draft}
                          rows={10}
                          disabled={!canEdit || busy === setting.key}
                          onChange={(event) => setDrafts({ ...drafts, [setting.key]: event.target.value })}
                          className="w-full rounded-[7px] border border-surface-3 bg-surface-2 p-2.5 text-[12px] leading-5 text-white outline-none focus:border-coral disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={!canEdit || !dirty || busy === setting.key}
                          onClick={() => void save(setting)}
                          className="h-9 rounded-[7px] bg-coral px-3 text-xs font-bold text-white disabled:bg-surface-2 disabled:text-subtle"
                        >
                          {busy === setting.key ? '…' : 'Опубликовать'}
                        </button>
                      </div>
                    ) : setting.kind === 'url' ? (
                      <div className="flex items-center gap-2">
                        {setting.value !== '' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={String(setting.value)}
                            alt={`QR ${setting.label}`}
                            className="h-14 w-14 rounded-[7px] border border-surface-3 bg-white object-contain p-1"
                          />
                        )}
                        <label className={`h-9 cursor-pointer rounded-[7px] border border-surface-3 px-3 text-xs font-bold leading-9 text-white ${!canEdit || busy === setting.key ? 'pointer-events-none opacity-50' : ''}`}>
                          {busy === setting.key ? '…' : setting.value === '' ? 'Загрузить QR' : 'Заменить'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            aria-label={setting.label}
                            disabled={!canEdit || busy === setting.key}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) void uploadQr(setting, file);
                            }}
                          />
                        </label>
                        {setting.value !== '' && (
                          <button
                            type="button"
                            disabled={!canEdit || busy === setting.key}
                            onClick={() => void clearQr(setting)}
                            className="h-9 rounded-[7px] border border-surface-3 px-3 text-xs font-semibold text-subtle disabled:opacity-50"
                          >
                            Убрать
                          </button>
                        )}
                      </div>
                    ) : (
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
                    )}
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
