// Advisory TDD nudge (PostToolUse на Write|Edit). Если правится исходник apps/api
// (не тест) — печатает напоминание про test-first. Всегда exit 0: только подсказка,
// никогда не блокирует и не роняет вызов инструмента.
let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const path = (input.tool_input && input.tool_input.file_path) || '';
    if (/apps\/api\/src\/.*\.ts$/.test(path) && !/\.spec\.ts$/.test(path)) {
      console.log(
        '[TDD] .claude/skills/test-driven-development — написан ли сначала падающий *.spec.ts на это изменение? Тест пишется до реализации.',
      );
    }
  } catch (e) {
    /* advisory only — swallow any error, never fail the tool */
  }
  process.exit(0);
});
