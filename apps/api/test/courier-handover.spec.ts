import { ConflictError, ForbiddenError } from '../src/common/errors';
import { assertCourierRunOwner, replayCourierHandover } from '../src/courier/courier-handover';

const settledRun = {
  id: 'run-1',
  courierId: 'courier-1',
  codTotal: 1_000,
  handoverAmount: 900,
  handoverReason: 'provider adjustment',
  handedOver: true,
};

describe('courier handover replay rules', () => {
  it('replays only the exact run and canonical payload', () => {
    expect(replayCourierHandover(settledRun, 'run-1', {
      amount: 900,
      reason: 'provider adjustment',
    })).toMatchObject({ id: 'run-1', handedOver: true, diff: -100 });
  });

  it.each([
    ['another run', 'run-2', 900, 'provider adjustment'],
    ['another amount', 'run-1', 1_000, 'provider adjustment'],
    ['another reason', 'run-1', 900, 'cash shortage'],
  ])('rejects key reuse for %s', (_label, runId, amount, reason) => {
    expect(() => replayCourierHandover(settledRun, runId, { amount, reason }))
      .toThrow(ConflictError);
  });

  it('checks courier ownership before a replay is returned', () => {
    expect(() => assertCourierRunOwner(settledRun, 'courier-2')).toThrow(ForbiddenError);
    expect(() => assertCourierRunOwner(settledRun, 'courier-1')).not.toThrow();
    expect(() => assertCourierRunOwner(settledRun)).not.toThrow();
  });
});
