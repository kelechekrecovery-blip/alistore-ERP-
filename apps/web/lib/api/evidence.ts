import { API_BASE } from './http';

export type EvidenceEntityType = 'tradein' | 'return' | 'warranty' | 'inventory' | 'order' | 'support' | 'shift';

export interface EvidenceAsset {
  key: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  format: 'webp';
}

export interface EvidenceAttachment {
  entityType: EvidenceEntityType;
  entityId: string;
  asset: EvidenceAsset;
  label: string | null;
}

export async function uploadEvidenceImage(input: {
  file: File;
  entityType: EvidenceEntityType;
  entityId: string;
  label?: string;
  actor?: string;
  accessToken?: string;
  guestCapability?: string;
}): Promise<EvidenceAttachment> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('entityType', input.entityType);
  form.append('entityId', input.entityId);
  if (input.label) form.append('label', input.label);
  if (input.actor) form.append('actor', input.actor);

  const res = await fetch(`${API_BASE}/evidence/images`, {
    method: 'POST',
    headers: {
      ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
      ...(input.guestCapability ? { 'x-guest-capability': input.guestCapability } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { message?: string }).message ?? `evidence ${res.status}`);
  }
  return (await res.json()) as EvidenceAttachment;
}

export async function uploadEvidenceImages(input: {
  files: File[];
  entityType: EvidenceEntityType;
  entityId: string;
  label?: string;
  actor?: string;
  accessToken?: string;
  guestCapability?: string;
}): Promise<EvidenceAttachment[]> {
  const results: EvidenceAttachment[] = [];
  for (const file of input.files) {
    results.push(await uploadEvidenceImage({ ...input, file }));
  }
  return results;
}
