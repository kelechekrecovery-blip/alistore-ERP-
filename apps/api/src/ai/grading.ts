import { ChatMessage, openRouterChat, OpenRouterOptions } from './openrouter-provider';
import { DeviceGrade } from './valuation';

export interface PhotoEvidence {
  url?: string;
  evidenceId?: string;
  label?: string;
  mimeType?: string;
}

export interface PhotoGradingInput {
  photos: PhotoEvidence[];
  model?: string;
  imei?: string;
  claimedGrade?: DeviceGrade;
  observedDefects?: string[];
}

export interface PhotoGradingResult {
  source: string;
  grade: DeviceGrade;
  confidence: number;
  defects: string[];
  notes: string[];
  recommendedChecks: string[];
}

const GRADE_RANK: Record<DeviceGrade, number> = { A: 3, B: 2, C: 1 };
const RANK_GRADE: Record<number, DeviceGrade> = { 1: 'C', 2: 'B', 3: 'A' };
const CRITICAL_TERMS = ['water', 'влага', 'утоп', 'locked', 'icloud', 'no_power', 'не включ', 'imei_mismatch'];
const SCREEN_TERMS = ['screen', 'display', 'экран'];
const DEFECT_CONTEXT_TERMS = ['scratch', 'crack', 'broken', 'issue', 'damage', 'dead', 'царап', 'трещ', 'бит', 'не раб'];
const BODY_TERMS = ['body', 'корпус', 'dent', 'скол', 'scratch', 'царап', 'износ'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function normalizeDefects(input: PhotoGradingInput): string[] {
  const raw = [
    ...(input.observedDefects ?? []),
    ...input.photos.flatMap((p) => [p.label, p.url, p.evidenceId].filter(Boolean) as string[]),
  ];
  const defects = new Set<string>();
  for (const item of raw) {
    const text = item.toLowerCase();
    if (hasAny(text, CRITICAL_TERMS)) defects.add('critical_damage');
    if (text.includes('battery') || text.includes('аккумулятор')) defects.add('battery_wear');
    if (text.includes('camera') || text.includes('камера')) defects.add('camera_issue');
    if (hasAny(text, SCREEN_TERMS) && hasAny(text, DEFECT_CONTEXT_TERMS)) defects.add('screen_issue');
    if (
      !text.includes('battery') &&
      !text.includes('аккумулятор') &&
      !hasAny(text, SCREEN_TERMS) &&
      hasAny(text, BODY_TERMS)
    ) {
      defects.add('body_wear');
    }
  }
  return [...defects].sort();
}

/**
 * Keyless photo grading scaffold. It deliberately does not pretend to see pixels;
 * it grades from intake labels/manual findings and photo coverage, while the
 * OpenRouter provider can be enabled later for real vision analysis.
 */
export function gradePhotosByRules(input: PhotoGradingInput): PhotoGradingResult {
  const defects = normalizeDefects(input);
  const hasCritical = defects.includes('critical_damage');
  const heavyCount = defects.filter((d) => ['battery_wear', 'camera_issue', 'screen_issue'].includes(d)).length;
  const minorCount = defects.filter((d) => d === 'body_wear').length;

  let grade: DeviceGrade = 'A';
  if (hasCritical || heavyCount >= 2) grade = 'C';
  else if (heavyCount === 1 || minorCount >= 1 || input.photos.length < 3) grade = 'B';

  if (input.claimedGrade && GRADE_RANK[input.claimedGrade] < GRADE_RANK[grade]) {
    grade = input.claimedGrade;
  }

  const coverage = Math.min(4, input.photos.length);
  const confidence = round2(Math.min(0.92, 0.48 + coverage * 0.08 + defects.length * 0.06));
  const notes: string[] = [];
  const recommendedChecks = ['Проверить IMEI/серийный номер', 'Сверить фото с устройством при приёмке'];

  if (grade === 'A') notes.push('Фото/анкета не показывают дефектов; подтвердите состояние при осмотре.');
  if (grade === 'B') notes.push('Есть признаки износа или неполный фото-набор; закладывайте дисконт.');
  if (grade === 'C') notes.push('Существенный риск ремонта/блокировки; нужна ручная проверка старшим.');
  if (input.photos.length < 4) recommendedChecks.push('Доснять 4 ракурса: front/back/edges/screen-on');
  if (hasCritical) recommendedChecks.push('Проверить влагу, блокировки и включение до договора');
  if (defects.includes('battery_wear')) recommendedChecks.push('Снять battery health / cycle count');

  return { source: 'rules', grade, confidence, defects, notes, recommendedChecks };
}

export function buildPhotoGradingMessages(input: PhotoGradingInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Ты — эксперт приёмки Б/У электроники AliStore.',
        'Оцени состояние по ссылкам/описаниям фото и ручным дефектам.',
        'Верни СТРОГО JSON-объект {"grade","confidence","defects","notes","recommendedChecks"}.',
        'grade ∈ {"A","B","C"}, confidence 0..1. Не выдумывай факты: если фото недоступны, снизь confidence.',
      ].join(' '),
    },
    { role: 'user', content: JSON.stringify(input) },
  ];
}

export function parsePhotoGradingResponse(content: string): Omit<PhotoGradingResult, 'source'> {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in grading response');
  const raw = JSON.parse(content.slice(start, end + 1)) as {
    grade?: unknown;
    confidence?: unknown;
    defects?: unknown;
    notes?: unknown;
    recommendedChecks?: unknown;
  };
  if (raw.grade !== 'A' && raw.grade !== 'B' && raw.grade !== 'C') throw new Error('invalid grade');
  const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  const defects = Array.isArray(raw.defects) ? raw.defects.filter((v): v is string => typeof v === 'string') : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((v): v is string => typeof v === 'string') : [];
  const recommendedChecks = Array.isArray(raw.recommendedChecks)
    ? raw.recommendedChecks.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    grade: raw.grade,
    confidence: round2(confidence),
    defects: defects.slice(0, 12),
    notes: notes.slice(0, 6),
    recommendedChecks: recommendedChecks.slice(0, 8),
  };
}

export class OpenRouterPhotoGradingProvider {
  readonly source: string;

  constructor(private readonly opts: OpenRouterOptions) {
    this.source = `openrouter:${opts.model ?? 'openai/gpt-4o-mini'}`;
  }

  async grade(input: PhotoGradingInput): Promise<PhotoGradingResult> {
    const content = await openRouterChat(buildPhotoGradingMessages(input), this.opts);
    return { source: this.source, ...parsePhotoGradingResponse(content) };
  }
}
