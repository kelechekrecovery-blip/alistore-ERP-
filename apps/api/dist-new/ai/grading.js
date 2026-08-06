"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHOTO_GRADING_SCHEMA = void 0;
exports.gradePhotosByRules = gradePhotosByRules;
exports.buildVisionGradingMessages = buildVisionGradingMessages;
exports.gradingSystemPrompt = gradingSystemPrompt;
exports.buildPhotoGradingMessages = buildPhotoGradingMessages;
exports.parsePhotoGradingResponse = parsePhotoGradingResponse;
const GRADE_RANK = { A: 3, B: 2, C: 1 };
const RANK_GRADE = { 1: 'C', 2: 'B', 3: 'A' };
const CRITICAL_TERMS = ['water', 'влага', 'утоп', 'locked', 'icloud', 'no_power', 'не включ', 'imei_mismatch'];
const SCREEN_TERMS = ['screen', 'display', 'экран'];
const DEFECT_CONTEXT_TERMS = ['scratch', 'crack', 'broken', 'issue', 'damage', 'dead', 'царап', 'трещ', 'бит', 'не раб'];
const BODY_TERMS = ['body', 'корпус', 'dent', 'скол', 'scratch', 'царап', 'износ'];
function round2(n) {
    return Math.round(n * 100) / 100;
}
function hasAny(text, terms) {
    return terms.some((term) => text.includes(term));
}
function normalizeDefects(input) {
    const raw = [
        ...(input.observedDefects ?? []),
        ...input.photos.flatMap((p) => [p.label, p.url, p.evidenceId].filter(Boolean)),
    ];
    const defects = new Set();
    for (const item of raw) {
        const text = item.toLowerCase();
        if (hasAny(text, CRITICAL_TERMS))
            defects.add('critical_damage');
        if (text.includes('battery') || text.includes('аккумулятор'))
            defects.add('battery_wear');
        if (text.includes('camera') || text.includes('камера'))
            defects.add('camera_issue');
        if (hasAny(text, SCREEN_TERMS) && hasAny(text, DEFECT_CONTEXT_TERMS))
            defects.add('screen_issue');
        if (!text.includes('battery') &&
            !text.includes('аккумулятор') &&
            !hasAny(text, SCREEN_TERMS) &&
            hasAny(text, BODY_TERMS)) {
            defects.add('body_wear');
        }
    }
    return [...defects].sort();
}
function gradePhotosByRules(input) {
    const defects = normalizeDefects(input);
    const hasCritical = defects.includes('critical_damage');
    const heavyCount = defects.filter((d) => ['battery_wear', 'camera_issue', 'screen_issue'].includes(d)).length;
    const minorCount = defects.filter((d) => d === 'body_wear').length;
    let grade = 'A';
    if (hasCritical || heavyCount >= 2)
        grade = 'C';
    else if (heavyCount === 1 || minorCount >= 1 || input.photos.length < 3)
        grade = 'B';
    if (input.claimedGrade && GRADE_RANK[input.claimedGrade] < GRADE_RANK[grade]) {
        grade = input.claimedGrade;
    }
    const coverage = Math.min(4, input.photos.length);
    const confidence = round2(Math.min(0.92, 0.48 + coverage * 0.08 + defects.length * 0.06));
    const notes = [];
    const recommendedChecks = ['Проверить IMEI/серийный номер', 'Сверить фото с устройством при приёмке'];
    if (grade === 'A')
        notes.push('Фото/анкета не показывают дефектов; подтвердите состояние при осмотре.');
    if (grade === 'B')
        notes.push('Есть признаки износа или неполный фото-набор; закладывайте дисконт.');
    if (grade === 'C')
        notes.push('Существенный риск ремонта/блокировки; нужна ручная проверка старшим.');
    if (input.photos.length < 4)
        recommendedChecks.push('Доснять 4 ракурса: front/back/edges/screen-on');
    if (hasCritical)
        recommendedChecks.push('Проверить влагу, блокировки и включение до договора');
    if (defects.includes('battery_wear'))
        recommendedChecks.push('Снять battery health / cycle count');
    return { source: 'rules', grade, confidence, defects, notes, recommendedChecks };
}
const GRADING_SYSTEM = [
    'Ты — эксперт приёмки Б/У электроники AliStore.',
    'Оцени реальное состояние устройства и верни строгий результат.',
    'Рубрика AliStore (следуй ей строго):',
    'A — полный набор ракурсов (3+ фото/меток) и НИ ОДНОГО дефекта на фото или в анкете.',
    'B — один тяжёлый дефект (экран/аккумулятор/камера), износ корпуса, ИЛИ неполный набор (<3 ракурсов).',
    'C — влага/окисление, блокировка (iCloud/не включается), IMEI-mismatch, или 2+ тяжёлых дефектов.',
    'Если claimedGrade заявлен НИЖЕ рассчитанного — используй claimedGrade.',
    'Смотри на дефекты: трещины и сколы экрана/корпуса, царапины, вздутие/деформация (возможный аккумулятор),',
    'следы влаги/окисления, отсутствие/повреждение камеры, признаки вскрытия. Не выдумывай факты:',
    'если дефекта нет на фото и в анкете — не заявляй его; если фото недоступны — грейди по анкете/меткам по рубрике и снижай confidence.',
    'confidence 0..1. defects — короткие машинные метки, notes и recommendedChecks — на русском.',
].join(' ');
exports.PHOTO_GRADING_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        grade: { type: 'string', enum: ['A', 'B', 'C'] },
        confidence: { type: 'number' },
        defects: { type: 'array', items: { type: 'string' } },
        notes: { type: 'array', items: { type: 'string' } },
        recommendedChecks: { type: 'array', items: { type: 'string' } },
    },
    required: ['grade', 'confidence', 'defects', 'notes', 'recommendedChecks'],
};
function gradingContextText(input, resolvedCount) {
    const ctx = {
        model: input.model ?? null,
        imei: input.imei ?? null,
        claimedGrade: input.claimedGrade ?? null,
        observedDefects: input.observedDefects ?? [],
        photosProvided: input.photos.length,
        photosResolved: resolvedCount,
    };
    return [
        'Оцени устройство по приложенным фото и данным анкеты (JSON ниже).',
        resolvedCount === 0
            ? 'Фото не удалось загрузить — оценивай осторожно и снижай confidence.'
            : `Приложено фото: ${resolvedCount}.`,
        `Анкета: ${JSON.stringify(ctx)}`,
    ].join('\n');
}
function buildVisionGradingMessages(input, images) {
    const content = [
        { type: 'text', text: gradingContextText(input, images.length) },
        ...images.map((img) => ({ type: 'image', mediaType: img.mediaType, dataBase64: img.dataBase64 })),
    ];
    return [{ role: 'user', content }];
}
function gradingSystemPrompt() {
    return GRADING_SYSTEM;
}
function buildPhotoGradingMessages(input) {
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
function parsePhotoGradingResponse(content) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start)
        throw new Error('no JSON object in grading response');
    const raw = JSON.parse(content.slice(start, end + 1));
    if (raw.grade !== 'A' && raw.grade !== 'B' && raw.grade !== 'C')
        throw new Error('invalid grade');
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    const defects = Array.isArray(raw.defects) ? raw.defects.filter((v) => typeof v === 'string') : [];
    const notes = Array.isArray(raw.notes) ? raw.notes.filter((v) => typeof v === 'string') : [];
    const recommendedChecks = Array.isArray(raw.recommendedChecks)
        ? raw.recommendedChecks.filter((v) => typeof v === 'string')
        : [];
    return {
        grade: raw.grade,
        confidence: round2(confidence),
        defects: defects.slice(0, 12),
        notes: notes.slice(0, 6),
        recommendedChecks: recommendedChecks.slice(0, 8),
    };
}
//# sourceMappingURL=grading.js.map