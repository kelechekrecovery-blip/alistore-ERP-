/**
 * The publishable report.
 *
 * Written to be posted as-is: fingerprints first so anyone can verify the rules
 * predate the results, then the ranking, then every disqualification with its
 * reason. Nothing is summarised away.
 */

const REASON_LABELS = {
  empty: 'бош комментарий / пустой комментарий',
  emoji_only: 'сөз жок, эмодзи гана / только эмодзи, без слов',
  duplicate: 'кайталанган текст / дубликат текста',
  before_start: 'конкурс башталганга чейин / до старта конкурса',
  excluded: 'кызматкер же чектелген аккаунт / сотрудник или исключённый аккаунт',
  spam_burst: 'бир колдонуучудан ашыкча комментарий / превышен лимит на пользователя',
};

export function renderMarkdown(result, meta = {}) {
  const sections = [
    header(meta),
    fingerprints(result),
    criteriaTable(result.criteria),
    statsBlock(result.stats),
    shortlistTable(result.shortlist),
    disqualifiedTable(result.disqualified),
  ];

  if (meta.decision) sections.push(decisionBlock(meta.decision));
  if (meta.awards) sections.push(awardsTable(meta.awards));

  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

function header(meta) {
  const lines = ['# Конкурс — жыйынтык / результаты судейства'];
  if (meta.postUrl) lines.push(`**Пост:** ${meta.postUrl}`);
  if (meta.generatedAt) lines.push(`**Отчёт сформирован:** ${meta.generatedAt}`);
  return lines.join('\n\n');
}

function fingerprints(result) {
  return [
    '## Текшерүү / Проверка честности',
    '',
    'Эти два хеша публикуются **до** подведения итогов. Любое изменение правил',
    'или списка комментариев меняет хеш — подмену видно всем.',
    '',
    `- **Критерии (SHA-256):** \`${result.fingerprint.criteria}\``,
    `- **Комментарии (SHA-256):** \`${result.fingerprint.input}\``,
  ].join('\n');
}

function criteriaTable(criteria) {
  const rows = Object.entries(criteria.weights)
    .map(([key, weight]) => `| ${key} | ${weight} |`)
    .join('\n');

  return [
    `## Критерии оценки (версия ${criteria.version})`,
    '',
    '| Критерий | Вес |',
    '|---|---|',
    rows,
  ].join('\n');
}

function statsBlock(stats) {
  return [
    '## Сводка',
    '',
    `- Всего комментариев: **${stats.total}**`,
    `- Допущено: **${stats.eligible}**`,
    `- Отклонено: **${stats.disqualified}**`,
    `- В шорт-листе: **${stats.shortlisted}**`,
  ].join('\n');
}

function shortlistTable(shortlist) {
  const rows = shortlist
    .map(
      (c) =>
        `| ${c.rank} | @${c.username} | ${c.total} | ${c.breakdown.substance} | ` +
        `${c.breakdown.originality} | ${c.breakdown.language} | ${c.breakdown.relevance} | ` +
        `${c.breakdown.peer} | ${escapePipes(c.text)} |`,
    )
    .join('\n');

  return [
    '## Шорт-лист',
    '',
    '| # | Аккаунт | Балл | Содержание | Оригинальность | Язык | Релевантность | Лайки | Комментарий |',
    '|---|---|---|---|---|---|---|---|---|',
    rows,
  ].join('\n');
}

function disqualifiedTable(disqualified) {
  if (disqualified.length === 0) return '## Отклонённые\n\nНет.';

  const counts = new Map();
  for (const { reason } of disqualified) counts.set(reason, (counts.get(reason) ?? 0) + 1);

  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `| \`${reason}\` | ${REASON_LABELS[reason] ?? reason} | ${count} |`)
    .join('\n');

  return [
    '## Отклонённые',
    '',
    '| Код | Причина | Сколько |',
    '|---|---|---|',
    summary,
  ].join('\n');
}

function decisionBlock(decision) {
  return [
    '## Решение жюри',
    '',
    `- **Победитель:** @${decision.username} (место в шорт-листе: ${decision.rank}, балл ${decision.total})`,
    `- **Решение принял:** ${decision.decidedBy}`,
    '',
    '**Обоснование:**',
    '',
    `> ${decision.justification}`,
  ].join('\n');
}

function awardsTable(awards) {
  const rows = awards.map((a) => `| ${a.prize} | @${a.username} | ${a.rank} |`).join('\n');
  return ['## Призы', '', '| Приз | Аккаунт | Место |', '|---|---|---|', rows].join('\n');
}

function escapePipes(text) {
  return String(text).replace(/\s+/gu, ' ').replace(/\|/gu, '\\|').trim();
}
