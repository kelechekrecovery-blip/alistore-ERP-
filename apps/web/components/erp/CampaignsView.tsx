'use client';

import { useCallback, useEffect, useState } from 'react';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { som } from '@/lib/format';
import {
  createCampaign,
  fetchCampaigns,
  previewCampaign,
  recordCampaignConversion,
  type CampaignPreview,
  type CampaignRoi,
  type SegmentRules,
} from '@/lib/api/campaigns';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

const CHANNELS = ['sms', 'push', 'telegram'] as const;
const FIELD_CLASS = 'w-full rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none transition placeholder:text-[#6E645C] focus:border-coral focus:ring-2 focus:ring-coral/20';

type CampaignForm = {
  level: string;
  city: string;
  tags: string;
  minSpent: string;
  budget: string;
  channel: (typeof CHANNELS)[number];
  message: string;
};

const INITIAL_FORM: CampaignForm = {
  level: 'gold',
  city: 'Бишкек',
  tags: '',
  minSpent: '50000',
  budget: '10000',
  channel: 'sms',
  message: 'VIP-предложение AliStore',
};

export function CampaignsView() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState<CampaignForm>(INITIAL_FORM);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRoi[]>([]);
  const [orderIds, setOrderIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>('');

  const load = useCallback(() => {
    if (!session) return;
    fetchCampaigns(session.accessToken).then(setCampaigns).catch(() => setCampaigns([]));
  }, [session]);

  useEffect(() => {
    setSession(loadStaffSession());
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

  async function launch() {
    if (!session) return;
    setBusy('launch');
    setNotice('');
    try {
      const created = await createCampaign(
        {
          ...rulesFromForm(form),
          channel: form.channel,
          budget: numberOrZero(form.budget),
          message: form.message.trim() || undefined,
        },
        session.accessToken,
      );
      setNotice(`Кампания создана, в outbox поставлено ${created.queued}`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Кампания не создана');
    } finally {
      setBusy(null);
    }
  }

  async function convert(campaignId: string) {
    if (!session) return;
    const orderId = orderIds[campaignId]?.trim();
    if (!orderId) return;
    setBusy(campaignId);
    setNotice('');
    try {
      await recordCampaignConversion(campaignId, orderId, session.accessToken);
      setOrderIds((current) => ({ ...current, [campaignId]: '' }));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Конверсия не записана');
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
    return <p className="font-mono text-sm text-[#6E645C]">Загрузка…</p>;
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
      <section className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#8A7F76]">
          <span>{session.username} · {session.role}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-chip border border-[#2E2822] px-3 py-1.5 font-semibold text-[#A79C92] hover:text-white"
          >
            Выйти staff
          </button>
        </div>
        <div className="font-display text-[15px] font-bold">Сегмент</div>
        <div className="mt-4 grid gap-3">
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
                className={`rounded-chip px-3 py-1.5 text-[12px] font-bold ${form.channel === channel ? 'bg-lime text-lime-ink' : 'bg-[#221E19] text-[#A79C92] hover:text-white'}`}
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
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy === 'preview'} onClick={runPreview} className="rounded-btn bg-[#221E19] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Предпросмотр
          </button>
          <button type="button" disabled={busy === 'launch'} onClick={launch} className="rounded-btn bg-lime px-4 py-2 text-sm font-extrabold text-lime-ink disabled:opacity-50">
            Запустить
          </button>
        </div>
        {notice && <p className="mt-3 text-sm text-[#E5B23C]">{notice}</p>}
      </section>

      <section className="grid gap-4">
        <PreviewPanel preview={preview} />
        <CampaignList
          campaigns={campaigns}
          busy={busy}
          orderIds={orderIds}
          setOrderIds={setOrderIds}
          onConvert={convert}
        />
      </section>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: CampaignPreview | null }) {
  if (!preview) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#2E2822] bg-[#1A1611] px-5 py-12 text-center text-sm text-[#8A7F76]">
        Соберите preview — здесь появится аудитория с учётом consent.
      </div>
    );
  }
  return (
    <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="font-display text-[15px] font-bold">Preview</div>
          <p className="mt-1 text-xs text-[#8A7F76]">{preview.description}</p>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label="match" value={preview.matchedCustomers} />
          <Metric label="eligible" value={preview.eligibleCustomers} />
          <Metric label="no consent" value={preview.excludedNoConsent} />
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {preview.audience.slice(0, 8).map((customer) => (
          <li key={customer.id} className="flex items-center gap-3 rounded-[10px] bg-[#221E19] px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{customer.name}</span>
            <span className="font-mono text-xs text-[#C6FF3D]">{som(customer.spent)}</span>
            <span className="text-xs text-[#8A7F76]">{customer.segments.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignList({
  campaigns,
  busy,
  orderIds,
  setOrderIds,
  onConvert,
}: {
  campaigns: CampaignRoi[];
  busy: string | null;
  orderIds: Record<string, string>;
  setOrderIds: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onConvert: (campaignId: string) => void;
}) {
  return (
    <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
      <div className="mb-4 font-display text-[15px] font-bold">Кампании · ROI</div>
      {campaigns.length === 0 && <p className="text-sm text-[#8A7F76]">Кампаний пока нет.</p>}
      <ul className="grid gap-3">
        {campaigns.map((item) => (
          <li key={item.campaign.id} className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.description}</div>
                <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">{item.campaign.id}</div>
              </div>
              <span className="rounded-chip bg-[#1A1611] px-2.5 py-1 text-[11px] font-bold text-[#C6FF3D]">{item.campaign.channel}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Metric label="orders" value={item.orders} />
              <Metric label="revenue" value={som(item.revenue)} />
              <Metric label="profit" value={som(item.profit)} />
              <Metric label="ROI" value={item.roiPct === null ? '∞' : `${item.roiPct}%`} />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={orderIds[item.campaign.id] ?? ''}
                onChange={(e) => setOrderIds((current) => ({ ...current, [item.campaign.id]: e.target.value }))}
                className={`${FIELD_CLASS} min-w-0 flex-1`}
                placeholder="orderId"
              />
              <button
                type="button"
                disabled={busy === item.campaign.id}
                onClick={() => onConvert(item.campaign.id)}
                className="rounded-btn bg-[#1A1611] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                +ROI
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#8A7F76]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] bg-[#1A1611] px-3 py-2">
      <div className="font-mono text-[13px] font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase text-[#8A7F76]">{label}</div>
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
