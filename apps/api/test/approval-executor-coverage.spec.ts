import { FOUR_EYES_ACTIONS, SINGLE_APPROVER_ACTIONS } from '../src/approvals/approvals.service';
import { ACTION_EXECUTORS } from '../src/approvals/action-executors';

/**
 * Каждое опасное действие, уходящее на согласование, обязано что-то делать при
 * одобрении.
 *
 * Иначе получается худший из возможных исходов: одобряющий подтверждает
 * списание/удаление/публикацию, заявка переходит в `approved`, событие пишется в
 * леджер — а материального эффекта нет. Все следы говорят, что операция
 * состоялась. Заметить это можно только по фактическим данным недели спустя.
 *
 * Проверялось глазами и держалось на внимательности: `delete` регистрируется как
 * `delete: del`, потому что имя зарезервировано, и любой поиск по сокращённой
 * записи его теряет. Теперь это инвариант, а не наблюдательность.
 */
describe('Approval executor coverage', () => {
  /** Действия без исполнителя — только осознанные, с объяснением почему. */
  const INTENTIONALLY_WITHOUT_EXECUTOR: Record<string, string> = {
    discount: 'исполнителя нет намеренно: одобрение потребляет POS-продажа, помечая consumedAt',
    pii: 'доступ к персональным данным: материального изменения нет, одобрение и есть эффект',
    exchange: 'исполняется отдельной веткой decideOnTx через ExchangesService, не через ACTION_EXECUTORS',
  };

  it('every four-eyes action either has an executor or a documented reason not to', () => {
    const unhandled = FOUR_EYES_ACTIONS.filter(
      (action) => !ACTION_EXECUTORS[action] && !INTENTIONALLY_WITHOUT_EXECUTOR[action],
    );
    expect(unhandled).toEqual([]);
  });

  it('keeps the exception list honest — no entry for an action that now has an executor', () => {
    const stale = Object.keys(INTENTIONALLY_WITHOUT_EXECUTOR).filter((action) => ACTION_EXECUTORS[action]);
    expect(stale).toEqual([]);
  });

  it('keeps the exception list honest — no entry for an action that is not gated at all', () => {
    const notGated = Object.keys(INTENTIONALLY_WITHOUT_EXECUTOR)
      .filter((action) => !FOUR_EYES_ACTIONS.includes(action) && !SINGLE_APPROVER_ACTIONS.includes(action));
    expect(notGated).toEqual([]);
  });

  it('every executor belongs to an action that is actually gated', () => {
    // Исполнитель на негейтед действие никогда не сработает — значит либо
    // действие забыли закрыть согласованием, либо исполнитель мёртвый.
    const orphaned = Object.keys(ACTION_EXECUTORS).filter(
      (action) => !FOUR_EYES_ACTIONS.includes(action) && !SINGLE_APPROVER_ACTIONS.includes(action),
    );
    expect(orphaned).toEqual([]);
  });
});
