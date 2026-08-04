/**
 * The publishable draw result.
 *
 * Everything needed to reproduce the outcome goes in the post: commitment,
 * seed, beacon, list hash. Anything less and "мы провели честный розыгрыш" is
 * just a claim.
 */

export function renderMarkdown(result, meta = {}) {
  const sections = [
    header(meta),
    inputsBlock(result),
    winnersTable(result.winners, meta.prizes),
    statsBlock(result.stats),
    howToVerify(result, meta),
  ];

  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

function header(meta) {
  const lines = ['# Розыгрыш — жыйынтык / результаты'];
  if (meta.postUrl) lines.push(`**Пост:** ${meta.postUrl}`);
  if (meta.drawnAt) lines.push(`**Розыгрыш проведён:** ${meta.drawnAt}`);
  return lines.join('\n\n');
}

function inputsBlock(result) {
  return [
    '## Исходные данные / Баштапкы маалымат',
    '',
    'Обязательство (commitment) было опубликовано **до закрытия приёма заявок**.',
    'Сид раскрыт после. Если сид не хешируется в обязательство — розыгрыш недействителен.',
    '',
    `- **Обязательство (SHA-256 от сида):** \`${result.commitment}\``,
    `- **Сид (раскрыт после дедлайна):** \`${result.seed}\``,
    `- **Публичный маяк:** \`${result.beacon}\``,
    `- **Хеш списка участников:** \`${result.fingerprint.entries}\``,
  ].join('\n');
}

function winnersTable(winners, prizes = []) {
  const rows = winners
    .map((winner, index) => {
      const prize = prizes[index] ? ` | ${prizes[index]}` : '';
      return `| ${winner.rank} | @${winner.username}${prize} |`;
    })
    .join('\n');

  const head = prizes.length
    ? ['| # | Аккаунт | Приз |', '|---|---|---|']
    : ['| # | Аккаунт |', '|---|---|'];

  return ['## Победители / Жеңүүчүлөр', '', ...head, rows].join('\n');
}

function statsBlock(stats) {
  return [
    '## Сводка',
    '',
    `- Участников: **${stats.entrants}**`,
    `- Билетов в барабане: **${stats.tickets}**`,
    `- Разыграно мест: **${stats.places}**`,
  ].join('\n');
}

function howToVerify(result, meta) {
  const listFile = meta.entriesFile ?? 'entries.json';

  return [
    '## Как проверить самому',
    '',
    'Список участников опубликован файлом, все числа выше — в этом посте.',
    'Проверка занимает одну команду и не требует доверия к нам:',
    '',
    '```bash',
    `npm run contest:raffle -- verify \\`,
    `  --entries ${listFile} \\`,
    `  --seed ${result.seed} \\`,
    `  --beacon ${result.beacon} \\`,
    `  --commitment ${result.commitment} \\`,
    `  --winners ${result.winners.map((w) => w.username).join(',')}`,
    '```',
  ].join('\n');
}
