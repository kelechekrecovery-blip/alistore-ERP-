import type { ExternalReadinessReport } from '@/lib/api';
import { Card } from './Card';

/**
 * Launch-readiness panel of the ERP: renders the external-integration readiness report
 * (blocking vs optional vs ready checks, missing env, manual hardware steps) without ever
 * exposing secret values. Presentational — the report is fetched by the ERP page.
 */
export function ReadinessView({
  report,
  error,
}: {
  report: ExternalReadinessReport | null;
  error: string;
}) {
  if (error) {
    return (
      <Card>
        <div className="text-sm font-semibold text-coral">{error}</div>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <div className="text-sm text-subtle">Загружаем readiness report…</div>
      </Card>
    );
  }

  const isSatisfied = (check: ExternalReadinessReport['checks'][number]) =>
    check.status === 'certified'
    || (!check.attestationRequired && check.status === 'configured');
  const blocking = report.checks.filter((check) => check.blocking && !isSatisfied(check));
  const optional = report.checks.filter((check) => !check.blocking && !isSatisfied(check));
  const satisfied = report.checks.filter(isSatisfied);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-subtle">
              {report.mode === 'demo'
                ? 'Demo readiness contour'
                : report.sourceContractVersion === 1
                  ? 'Legacy readiness compatibility'
                  : 'Production readiness'}
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold">
              {report.mode === 'demo'
                ? 'Демо-контур — не production readiness'
                : report.sourceContractVersion === 1
                  ? 'API v1 — production assertion заблокирован'
                  : report.status === 'ready'
                    ? 'Готово к запуску'
                    : 'Нужны внешние доступы'}
            </div>
            <div className="mt-2 max-w-2xl text-sm text-muted">
              Маркер — это отзывчивая operator/deployment attestation по указанным ручным
              критериям, а не проверенная кодом ссылка или SHA. Его сбрасывают при изменении
              release-зависимого провайдера, модели, callback, домена или политики.
            </div>
          </div>
          <div className="grid min-w-[320px] grid-cols-4 gap-2 text-center">
            <ReadinessMetric label="Certified" value={report.summary.certified} tone="good" />
            <ReadinessMetric label="Configured" value={report.summary.configured} tone="warn" />
            <ReadinessMetric label="Missing" value={report.summary.missing} tone="bad" />
            <ReadinessMetric label="Blocked" value={report.summary.blocked} tone="bad" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-subtle">
          <span className="rounded-chip bg-surface-2 px-2.5 py-1">
            blocking: {report.summary.blockingRemaining}
          </span>
          <span className="rounded-chip bg-surface-2 px-2.5 py-1">
            generated: {new Date(report.generatedAt).toLocaleString('ru-RU')}
          </span>
          <span className="rounded-chip bg-surface-2 px-2.5 py-1">
            strict gate: npm run launch:readiness:strict
          </span>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <div className="font-display text-[15px] font-bold">Что блокирует production</div>
            <span className="rounded-chip bg-coral px-2.5 py-1 text-xs font-bold text-white">
              {blocking.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {blocking.map((check) => (
              <ReadinessRow key={check.id} check={check} />
            ))}
            {blocking.length === 0 && (
              <div className="rounded-[10px] border border-surface-3 bg-surface-2 p-3 text-sm text-lime">
                Все blocking-проверки закрыты.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-3.5 font-display text-[15px] font-bold">Optional перед launch</div>
            <div className="space-y-2.5">
              {optional.map((check) => (
                <ReadinessRow key={check.id} check={check} compact />
              ))}
              {optional.length === 0 && (
                <div className="text-sm text-subtle">Optional-пунктов без настройки нет.</div>
              )}
            </div>
          </Card>
          <Card>
            <div className="mb-3.5 font-display text-[15px] font-bold">Уже готово</div>
            <div className="flex flex-wrap gap-2">
              {satisfied.map((check) => (
                <span
                  key={check.id}
                  className="rounded-chip border border-lime/30 bg-[#18210F] px-2.5 py-1 text-xs font-semibold text-lime"
                >
                  {check.title}
                </span>
              ))}
              {satisfied.length === 0 && (
                <span className="text-sm text-subtle">Внешние пункты пока не закрыты.</span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReadinessMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'bad' | 'warn' | 'muted';
}) {
  const color = {
    good: 'text-lime',
    bad: 'text-coral',
    warn: 'text-warn',
    muted: 'text-muted',
  }[tone];
  return (
    <div className="rounded-[10px] border border-surface-3 bg-surface-2 p-3">
      <div className={`font-display text-xl font-extrabold ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-subtle">{label}</div>
    </div>
  );
}

function ReadinessRow({
  check,
  compact = false,
}: {
  check: ExternalReadinessReport['checks'][number];
  compact?: boolean;
}) {
  const status = {
    missing: ['missing', 'bg-coral text-white'],
    configured: ['configured', 'bg-warn text-[#18110A]'],
    certified: ['certified', 'bg-[#18210F] text-lime'],
    blocked: ['blocked', 'bg-coral text-white'],
  }[check.status];

  return (
    <div className="rounded-[10px] border border-surface-3 bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{check.title}</span>
            <span className="text-xs text-subtle">{check.area}</span>
          </div>
          {!compact && <div className="mt-1 text-xs leading-5 text-muted">{check.note}</div>}
        </div>
        <span className={`rounded-chip px-2 py-1 text-[10px] font-bold uppercase ${status[1]}`}>
          {status[0]}
        </span>
      </div>

      {check.missingEnv.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-subtle">
            Missing env
          </div>
          <div className="flex flex-wrap gap-1.5">
            {check.missingEnv.map((env) => (
              <code
                key={env}
                className="max-w-full break-all rounded bg-ink-dark px-1.5 py-1 text-[11px] text-bright"
              >
                {env}
              </code>
            ))}
          </div>
        </div>
      )}

      {check.manualChecks.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-bright">
          {check.manualChecks.map((manual) => (
            <li key={manual} className="flex gap-2">
              <span className="mt-0.5 text-warn">□</span>
              <span>{manual}</span>
            </li>
          ))}
        </ul>
      )}

      {check.attestationRequired && check.status !== 'certified' && (
        <div className="mt-3 text-[11px] text-subtle">
          Deployment attestation:{' '}
          <code className="text-bright">{check.attestationEnv ?? 'API_V2_UPGRADE_REQUIRED'}</code>
        </div>
      )}
    </div>
  );
}
