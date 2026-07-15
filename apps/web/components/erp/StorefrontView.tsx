'use client';

import { useEffect, useState } from 'react';
import { createStorefrontRevision, fetchStorefrontContent, fetchStorefrontRevisions, publishStorefrontRevision, type StorefrontContent } from '@/lib/api';

const FIELD = 'w-full rounded-[8px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none focus:border-coral';

export function StorefrontView({ accessToken }: { accessToken: string }) {
  const [form, setForm] = useState<StorefrontContent | null>(null);
  const [revisions, setRevisions] = useState<StorefrontContent[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [payload, history] = await Promise.all([fetchStorefrontContent(), fetchStorefrontRevisions(accessToken)]);
    if (payload) setForm(payload.content);
    setRevisions(history);
  };
  useEffect(() => { load().catch(() => setNotice('Не удалось загрузить CMS витрины')); }, [accessToken]);

  if (!form) return <div className="text-sm text-[#8A7F76]">Загрузка CMS витрины...</div>;
  const set = (key: keyof StorefrontContent, value: string) => setForm((current) => current ? { ...current, [key]: value } : current);

  async function saveDraft() {
    if (!form) return;
    setBusy(true); setNotice('');
    try {
      const { id: _id, version: _version, status: _status, publishedAt: _publishedAt, ...input } = form;
      const revision = await createStorefrontRevision(input, accessToken);
      setNotice(`Черновик v${revision.version} сохранён`);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Черновик не сохранён'); }
    finally { setBusy(false); }
  }

  async function publish(id: string) {
    setBusy(true); setNotice('');
    try { const revision = await publishStorefrontRevision(id, accessToken); setNotice(`Версия v${revision.version} опубликована на сайте`); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Публикация не выполнена'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]"><section className="rounded-[12px] border border-[#2E2822] bg-[#1A1611] p-5"><h2 className="font-bold">Контент клиентского сайта</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Метка"><input className={FIELD} value={form.heroEyebrow} onChange={(e) => set('heroEyebrow', e.target.value)} /></Field><Field label="Заголовок"><input className={FIELD} value={form.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} /></Field><Field label="Описание"><textarea className={`${FIELD} min-h-24`} value={form.heroBody} onChange={(e) => set('heroBody', e.target.value)} /></Field><Field label="HTTPS URL изображения"><input className={FIELD} value={form.heroImageUrl ?? ''} onChange={(e) => set('heroImageUrl', e.target.value)} /></Field><Field label="Кнопка"><input className={FIELD} value={form.heroCtaLabel} onChange={(e) => set('heroCtaLabel', e.target.value)} /></Field><Field label="Ссылка"><input className={FIELD} value={form.heroCtaHref} onChange={(e) => set('heroCtaHref', e.target.value)} /></Field><Field label="О компании"><textarea className={`${FIELD} min-h-28`} value={form.aboutBody} onChange={(e) => set('aboutBody', e.target.value)} /></Field><Field label="Доставка"><textarea className={`${FIELD} min-h-28`} value={form.deliveryBody} onChange={(e) => set('deliveryBody', e.target.value)} /></Field><Field label="Телефон"><input className={FIELD} value={form.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} /></Field><Field label="Часы поддержки"><input className={FIELD} value={form.supportHours ?? ''} onChange={(e) => set('supportHours', e.target.value)} /></Field></div><button disabled={busy} onClick={saveDraft} className="mt-5 rounded-[8px] bg-lime px-5 py-2.5 text-sm font-bold text-lime-ink disabled:opacity-50">Сохранить черновик</button>{notice && <p className="mt-3 text-sm text-[#E5B23C]">{notice}</p>}</section><aside className="rounded-[12px] border border-[#2E2822] bg-[#1A1611] p-5"><h2 className="font-bold">История публикаций</h2><div className="mt-4 grid gap-2">{revisions.map((revision) => <div key={revision.id} className="rounded-[8px] border border-[#2E2822] bg-[#221E19] p-3"><div className="flex items-center justify-between"><b>v{revision.version}</b><span className="text-xs text-[#8A7F76]">{revision.status}</span></div><div className="mt-1 text-xs text-[#A79C92]">{revision.heroTitle}</div>{revision.status === 'draft' && <button disabled={busy} onClick={() => publish(revision.id)} className="mt-3 rounded-[7px] bg-coral px-3 py-1.5 text-xs font-bold text-white">Опубликовать</button>}</div>)}</div></aside></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-xs text-[#A79C92]"><span>{label}</span>{children}</label>; }
