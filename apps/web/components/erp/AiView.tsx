'use client';

import { useState } from 'react';
import { AsyncPanel } from './AsyncPanel';
import { runAiTool, type AiRunResult } from '@/lib/reports';
import type { Insight } from '@/lib/reports';

interface Props {
  insights: Insight[] | null;
  /** Кто выдал сводку: `rules`, имя модели или `rules (fallback)`. */
  source: string;
  error: string;
  onRetry: () => void;
  accessToken: string;
  role: string;
}

const TONE_META: Record<Insight['tone'], { border: string; dot: string; label: string }> = {
  warning: { border: 'border-warn/40', dot: 'bg-warn', label: 'Требует внимания' },
  positive: { border: 'border-lime/40', dot: 'bg-lime', label: 'Хорошо' },
  info: { border: 'border-surface-3', dot: 'bg-subtle', label: 'К сведению' },
};

/** Человеку понятнее «правила», чем `rules`; имя модели оставляем как есть. */
function sourceLabel(source: string): string {
  if (source === 'rules') return 'правила по данным леджера';
  if (source === 'rules (fallback)') return 'правила (провайдер недоступен)';
  return `модель ${source}`;
}

/**
 * Сводка по сети, выведенная из Event Ledger.
 *
 * Здесь был чат: три кнопки с заранее написанными ответами («Сегодня 1.24 млн
 * сом», «Азизбек: 620к продаж, KPI 96%») и без поля ввода. Настоящие инсайты
 * при этом приходили в проп и молча выбрасывались. Владелец читал выдуманные
 * цифры в интерфейсе, который выглядел как живой ассистент.
 *
 * Чат не восстановлен намеренно: эндпоинта диалога нет ни на одном из девяти
 * маршрутов `apps/api/src/ai`, а без ключа провайдера `resolveLlmClient()`
 * возвращает null. Поле ввода, за которым ничего нет, — это ровно тот механизм,
 * из-за которого экран и стал макетом.
 */
export function AiView({ insights, source, error, onRetry, accessToken, role }: Props) {
  const [run, setRun] = useState<AiRunResult | null>(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const canRun = role === 'owner' || role === 'admin';
  async function startAuditedRun() {
    setRunning(true);
    setRunError('');
    try { setRun(await runAiTool('insights', accessToken)); }
    catch (cause) { setRunError(cause instanceof Error ? cause.message : 'Не удалось записать AI-запуск'); }
    finally { setRunning(false); }
  }
  return (
    <div className="max-w-[720px]">
      <header className="mb-5 border-b border-surface-3 pb-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · AI 3.0</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">AI-ассистент</h1>
        <p className="mt-1 text-xs leading-5 text-subtle">
          {insights === null || error
            ? 'Сводка по данным сети'
            : `${insights.length === 0 ? 'Сигналов нет' : `Сигналов: ${insights.length}`} · источник: ${sourceLabel(source)}`}
        </p>
      </header>

      {canRun && <section className="mb-5 rounded-[10px] border border-[#FF7A4D]/30 bg-[#FF7A4D]/[.06] p-4" aria-label="Аудированный AI-запуск">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-white">Аудированный запуск</h2><p className="mt-1 text-xs text-subtle">Read-only анализ записывается в Event Ledger. Деньги, склад и статусы не изменяются.</p></div>
          <button type="button" onClick={startAuditedRun} disabled={running} className="rounded-[7px] bg-[#FF7A4D] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{running ? 'Считаем…' : 'Запустить и записать'}</button>
        </div>
        {runError && <p role="alert" className="mt-3 text-xs text-danger-soft">{runError}</p>}
        {run && <div className="mt-3 grid gap-2 text-xs text-sand sm:grid-cols-3"><span>Run: <code className="text-lime">{run.runId}</code></span><span>Уверенность: {run.decision.confidence ?? '—'}</span><span>Источник: {run.output.source ?? 'rules'}</span></div>}
      </section>}

      <AsyncPanel
        data={insights}
        error={error}
        onRetry={onRetry}
        loadingText="Считаем сводку по данным сети…"
        isEmpty={(list) => list.length === 0}
        emptyText="Сигналов нет: по текущим данным сеть работает штатно."
      >
        {(list) => (
          <ul className="space-y-3">
            {list.map((insight, index) => {
              const meta = TONE_META[insight.tone];
              return (
                <li key={`${insight.title}-${index}`} className={`rounded-[10px] border ${meta.border} bg-ink-dark p-4`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 flex-none rounded-full ${meta.dot}`} aria-hidden />
                    <strong className="text-sm text-white">{insight.title}</strong>
                    <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-subtle">{meta.label}</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-sand">{insight.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </AsyncPanel>
    </div>
  );
}
