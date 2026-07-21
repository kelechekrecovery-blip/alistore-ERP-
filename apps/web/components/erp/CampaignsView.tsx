'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { som } from '@/lib/format';
import {
  activateCampaign,
  completeCampaign,
  createCampaign,
  fetchCampaigns,
  pauseCampaign,
  previewCampaign,
  submitCampaign,
  type CampaignPreview,
  type CampaignRoi,
  type SegmentRules,
} from '@/lib/api/campaigns';
import { clearStaffSession, restoreStaffSession, type StaffSession } from '@/lib/staff-session';
import { ImageField } from './ImageField';

const CHANNELS = ['sms', 'push', 'telegram', 'whatsapp'] as const;
const FIELD_CLASS = 'w-full rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none transition placeholder:text-faint focus:border-coral focus:ring-2 focus:ring-coral/20';

type CampaignForm = {
  name: string;
  level: string;
  city: string;
  tags: string;
  minSpent: string;
  budget: string;
  channel: (typeof CHANNELS)[number];
  message: string;
  assetUrl: string;
  destinationUrl: string;
  source: string;
  promotionCode: string;
};

const INITIAL_FORM: CampaignForm = {
  name: 'VIP аксессуары · июль',
  level: 'gold',
  city: 'Бишкек',
  tags: '',
  minSpent: '50000',
  budget: '10000',
  channel: 'sms',
  message: 'VIP-предложение AliStore',
  assetUrl: '',
  destinationUrl: '/catalog',
  source: 'alistore_crm',
  promotionCode: '',
};

export function CampaignsView() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState<CampaignForm>(INITIAL_FORM);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRoi[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');

  const load = useCallback(() => {
    if (!session) return;
    // Пустой список кампаний и упавший запрос — разные вещи: раньше сбой
    // рисовал «кампаний нет», и маркетолог заводил дубль уже существующей.
    fetchCampaigns(session.accessToken)
      .then(setCampaigns)
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Не удалось загрузить кампании'));
  }, [session]);

  useEffect(() => {
    void restoreStaffSession().then(setSession);
    setHydrated(true);
  }, []);

  useEffect(() => { if (session) load(); }, [load, session]);

  async function runPreview() {
    if (!session) return;
    setBusy('preview');
    setNotice('');
    try {
      setPreview(await previewCampaign(rulesFromForm(form), session.accessToken));
    } catch {
      setNotice('Не удалось собрать сегмент');
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function createDraft() {
    if (!session) return;
    setBusy('create');
    setNotice('');
    try {
      const created = await createCampaign(
        {
          ...rulesFromForm(form),
          name: form.name.trim(),
          channel: form.channel,
          budget: numberOrZero(form.budget),
          creativeHeadline: form.name.trim(),
          creativeBody: form.message.trim() || undefined,
          creativeType: form.assetUrl.trim() ? 'image' : 'text',
          creativeAssetUrl: form.assetUrl.trim() || undefined,
          creativeCtaLabel: 'Смотреть предложение',
          destinationUrl: form.destinationUrl.trim() || '/',
          source: form.source.trim() || undefined,
          promotionCode: form.promotionCode.trim() || undefined,
        },
        session.accessToken,
      );
      setNotice('Черновик создан. Отправьте его на согласование бюджета.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Кампания не создана');
    } finally {
      setBusy(null);
    }
  }

  async function runAction(id: string, action: 'submit' | 'activate' | 'pause' | 'complete') {
    if (!session) return;
    setBusy(`${action}:${id}`);
    setNotice('');
    try {
      if (action === 'submit') await submitCampaign(id, session.accessToken);
      if (action === 'activate') await activateCampaign(id, session.accessToken);
      if (action === 'pause') await pauseCampaign(id, session.accessToken);
      if (action === 'complete') await completeCampaign(id, session.accessToken);
      setNotice(action === 'submit' ? 'Кампания отправлена в Approval Inbox.' : 'Статус кампании обновлён.');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    clearStaffSession();
    setSession(null);
    setPreview(null);
    setCampaigns([]);
  }

  if (!hydrated) {
    return <p className="font-mono text-sm text-faint">Загрузка…</p>;
  }

  if (!session) {
    return (
      <div className="grid min-h-[420px] place-items-center">
        <StaffSessionLogin
          title="Кампании · вход"
          caption="Нужна роль маркетолога, администратора или владельца."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.2fr]">
      <section className="rounded-[16px] border border-surface-3 bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
          <span>{session.username} · {session.role}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-chip border border-surface-3 px-3 py-1.5 font-semibold text-muted hover:text-white"
          >
            Выйти staff
          </button>
        </div>
        <div className="font-display text-[15px] font-bold">Сегмент</div>
        <div className="mt-4 grid gap-3">
          <Field label="Название кампании">
            <input value={form.name} onChange={(e) => setFormValue(setForm, 'name', e.target.value)} className={FIELD_CLASS} />
          </Field>
          <Field label="Уровень">
            <input value={form.level} onChange={(e) => setFormValue(setForm, 'level', e.target.value)} className={FIELD_CLASS} />
          </Field>
          <Field label="Город">
            <input value={form.city} onChange={(e) => setFormValue(setForm, 'city', e.target.value)} className={FIELD_CLASS} />
          </Field>
          <Field label="Теги">
            <input value={form.tags} onChange={(e) => setFormValue(setForm, 'tags', e.target.value)} className={FIELD_CLASS} placeholder="iphone, vip" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Мин. траты">
              <input value={form.minSpent} onChange={(e) => setFormValue(setForm, 'minSpent', e.target.value)} className={FIELD_CLASS} inputMode="numeric" />
            </Field>
            <Field label="Бюджет">
              <input value={form.budget} onChange={(e) => setFormValue(setForm, 'budget', e.target.value)} className={FIELD_CLASS} inputMode="numeric" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => setFormValue(setForm, 'channel', channel)}
                className={`rounded-chip px-3 py-1.5 text-[12px] font-bold ${form.channel === channel ? 'bg-lime text-lime-ink' : 'bg-surface-2 text-muted hover:text-white'}`}
              >
                {channel}
              </button>
            ))}
          </div>
          <Field label="Сообщение">
            <textarea
              value={form.message}
              onChange={(e) => setFormValue(setForm, 'message', e.target.value)}
              className={`${FIELD_CLASS} min-h-24 resize-none`}
            />
          </Field>
          <ImageField
            label="Медиа (необязательно)"
            value={form.assetUrl}
            onChange={(assetUrl) => setFormValue(setForm, 'assetUrl', assetUrl)}
            accessToken={session.accessToken}
            hint="креатив кампании"
          />
          <Field label="Куда ведёт кампания">
            <input value={form.destinationUrl} onChange={(e) => setFormValue(setForm, 'destinationUrl', e.target.value)} className={FIELD_CLASS} placeholder="/catalog" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Источник">
              <input value={form.source} onChange={(e) => setFormValue(setForm, 'source', e.target.value)} className={FIELD_CLASS} placeholder="alistore_crm" />
            </Field>
            <Field label="Промокод">
              <input value={form.promotionCode} onChange={(e) => setFormValue(setForm, 'promotionCode', e.target.value.toUpperCase())} className={FIELD_CLASS} placeholder="VIP10" />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy === 'preview'} onClick={runPreview} className="rounded-btn bg-surface-2 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Предпросмотр
          </button>
          <button type="button" disabled={busy === 'create'} onClick={createDraft} className="rounded-btn bg-lime px-4 py-2 text-sm font-extrabold text-lime-ink disabled:opacity-50">
            Создать черновик
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-warn">{notice}</p>}
      </section>

      <section className="grid gap-4">
        <PreviewPanel preview={preview} />
        <CampaignList campaigns={campaigns} busy={busy} onAction={runAction} />
      </section>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: CampaignPreview | null }) {
  if (!preview) {
    return (
      <div className="rounded-[16px] border border-dashed border-surface-3 bg-surface px-5 py-12 text-center text-sm text-subtle">
        Соберите preview — здесь появится аудитория с учётом consent.
      </div>
    );
  }
  return (
    <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="font-display text-[15px] font-bold">Preview</div>
          <p className="mt-1 text-xs text-subtle">{preview.description}</p>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label="match" value={preview.matchedCustomers} />
          <Metric label="eligible" value={preview.eligibleCustomers} />
          <Metric label="no consent" value={preview.excludedNoConsent} />
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {preview.audience.slice(0, 8).map((customer) => (
          <li key={customer.id} className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{customer.name}</span>
            <span className="font-mono text-xs text-lime">{som(customer.spent)}</span>
            <span className="text-xs text-subtle">{customer.segments.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignList({ campaigns, busy, onAction }: {
  campaigns: CampaignRoi[];
  busy: string | null;
  onAction: (id: string, action: 'submit' | 'activate' | 'pause' | 'complete') => void;
}) {
  return (
    <div className="rounded-[16px] border border-surface-3 bg-surface p-5">
      <div className="mb-4 font-display text-[15px] font-bold">Кампании · ROI</div>
      {campaigns.length === 0 && <p className="text-sm text-subtle">Кампаний пока нет.</p>}
      <ul className="grid gap-3">
        {campaigns.map((item) => (
          <li key={item.campaign.id} className="rounded-[12px] border border-surface-3 bg-surface-2 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.campaign.name}</div>
                <div className="mt-1 text-xs text-subtle">{item.description}</div>
              </div>
              <span className="rounded-chip bg-surface px-2.5 py-1 text-[11px] font-bold text-lime">{item.campaign.channel}</span>
              <span className="rounded-chip border border-line px-2.5 py-1 text-[11px] font-bold text-warn">{statusLabel(item.campaign.status)}</span>
            </div>
            <div className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap rounded-[8px] bg-surface px-3 py-2 font-mono text-[11px] text-muted" data-testid={`campaign-link-${item.campaign.id}`}>
              /?utm_source={item.campaign.source}&amp;utm_medium={item.campaign.medium}&amp;utm_campaign={item.campaign.trackingCode}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5" data-testid={`campaign-funnel-${item.campaign.id}`}>
              <Metric label="clicks" value={item.funnel.clicks} />
              <Metric label="visits" value={item.funnel.visits} />
              <Metric label="checkout" value={item.funnel.checkouts} />
              <Metric label="paid" value={item.funnel.conversions} />
              <Metric label="CVR" value={item.funnel.conversionRate === null ? '—' : `${item.funnel.conversionRate}%`} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6" data-testid={`campaign-net-${item.campaign.id}`}>
              <Metric label="paid revenue" value={som(item.revenue)} />
              <Metric label="refunds" value={som(item.refundRevenue)} />
              <Metric label="net revenue" value={som(item.netRevenue)} />
              <Metric label="net gross" value={som(item.netGrossProfit)} />
              <Metric label="net ROAS" value={item.roas === null ? '—' : `${item.roas}×`} />
              <Metric label="net ROI" value={item.roiPct === null ? '∞' : `${item.roiPct}%`} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Metric label="budget cap" value={som(item.budget)} />
              <Metric label="actual spend" value={som(item.spend)} />
              <Metric label="sent / pending" value={`${item.delivery.sent} / ${item.delivery.pending}`} />
              <Metric label="failed / cancelled" value={`${item.delivery.failed} / ${item.delivery.cancelled}`} />
            </div>
            {item.campaign.rejectionReason && <p className="mt-3 text-xs text-[#F08A7C]">Причина: {item.campaign.rejectionReason}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.campaign.status === 'draft' && <ActionButton label="На согласование" busy={busy === `submit:${item.campaign.id}`} onClick={() => onAction(item.campaign.id, 'submit')} />}
              {(item.campaign.status === 'approved' || item.campaign.status === 'paused') && <ActionButton label={item.campaign.status === 'paused' ? 'Возобновить' : 'Активировать'} busy={busy === `activate:${item.campaign.id}`} onClick={() => onAction(item.campaign.id, 'activate')} />}
              {item.campaign.status === 'active' && <ActionButton label="Пауза" busy={busy === `pause:${item.campaign.id}`} onClick={() => onAction(item.campaign.id, 'pause')} />}
              {['approved', 'active', 'paused'].includes(item.campaign.status) && <ActionButton label="Завершить" busy={busy === `complete:${item.campaign.id}`} onClick={() => onAction(item.campaign.id, 'complete')} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return <button type="button" disabled={busy} onClick={onClick} className="rounded-btn border border-line px-3 py-2 text-xs font-bold text-white hover:border-lime disabled:opacity-50">{label}</button>;
}

function statusLabel(status: CampaignRoi['campaign']['status']) {
  return ({ draft: 'Черновик', review: 'На согласовании', approved: 'Согласована', active: 'Активна', paused: 'Пауза', completed: 'Завершена' } as const)[status];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-subtle">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] bg-surface px-3 py-2">
      <div className="font-mono text-[13px] font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase text-subtle">{label}</div>
    </div>
  );
}

function rulesFromForm(form: CampaignForm): SegmentRules {
  return {
    level: optional(form.level),
    city: optional(form.city),
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    minSpent: optionalNumber(form.minSpent),
  };
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function numberOrZero(value: string): number {
  return Number(value.trim() || '0');
}

function setFormValue<K extends keyof CampaignForm>(
  setForm: React.Dispatch<React.SetStateAction<CampaignForm>>,
  key: K,
  value: CampaignForm[K],
) {
  setForm((current) => ({ ...current, [key]: value }));
}
