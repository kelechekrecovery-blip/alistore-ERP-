import { describe, expect, it } from 'vitest';
import { hostDecision } from './host-guard';

/**
 Регрессия WEB-SEC-501: контроль Host витрины был мёртвым кодом.

 Логика вынесена в этот чистый guard и вызывается из единственного Next 16
 entrypoint `proxy.ts`; второй `middleware.ts` намеренно не используется, чтобы
 Next не регистрировал два конфликтующих request entrypoint-а.
 */
describe('hostDecision', () => {
  const allowed = 'ali.kg,www.ali.kg,admin.ali.kg';

  it('пропускает свои хосты в проде', () => {
    expect(hostDecision('/', 'ali.kg', allowed, true)).toBe('allow');
    expect(hostDecision('/erp', 'admin.ali.kg', allowed, true)).toBe('allow');
    expect(hostDecision('/', 'ali.kg:443', allowed, true)).toBe('allow'); // порт отбрасывается
    expect(hostDecision('/', 'ALI.KG', allowed, true)).toBe('allow'); // регистр не важен
  });

  it('отклоняет посторонний хост в проде — защита от Host-header injection', () => {
    expect(hostDecision('/', 'evil.example.com', allowed, true)).toBe('reject');
    expect(hostDecision('/', 'alistore-web-prod.onrender.com', allowed, true)).toBe('reject');
  });

  it('всегда пропускает /healthz — Render дёргает его по *.onrender.com', () => {
    expect(hostDecision('/healthz', 'alistore-web-prod.onrender.com', allowed, true)).toBe('allow');
    expect(hostDecision('/healthz', '', allowed, true)).toBe('allow');
  });

  it('вне продакшена не ограничивает — локальная разработка', () => {
    expect(hostDecision('/', 'localhost', allowed, false)).toBe('allow');
    expect(hostDecision('/', 'evil.example.com', undefined, false)).toBe('allow');
  });

  it('пустой ALLOWED_HOSTS не роняет сайт — контроль бездействует, а не блокирует всё', () => {
    // Отказоустойчивость первой активации: забытая переменная = как было де-факто,
    // а не 421 на каждый запрос.
    expect(hostDecision('/', 'ali.kg', '', true)).toBe('allow');
    expect(hostDecision('/', 'anything', undefined, true)).toBe('allow');
    expect(hostDecision('/', 'x', '  ,  ', true)).toBe('allow');
  });
});
