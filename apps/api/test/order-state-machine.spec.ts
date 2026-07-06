import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
} from '../src/orders/order-state-machine';
import { ValidationError } from '../src/common/errors';

describe('order state machine (pure)', () => {
  it('allows the POS/web core path created → reserved → paid', () => {
    expect(canTransition('created', 'reserved')).toBe(true);
    expect(canTransition('reserved', 'paid')).toBe(true);
  });

  it('forbids skipping reservation: created → paid', () => {
    expect(canTransition('created', 'paid')).toBe(false);
  });

  it('assertTransition throws a 422 ValidationError on an illegal edge', () => {
    let caught: unknown;
    try {
      assertTransition('paid', 'created');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).getStatus()).toBe(422);
    expect((caught as ValidationError).code).toBe('illegal_transition');
  });

  it('terminal states have no outgoing transitions', () => {
    expect(ALLOWED_TRANSITIONS.completed).toContain('return_requested');
    expect(canTransition('refunded', 'paid')).toBe(false);
    expect(canTransition('cancelled', 'created')).toBe(false);
    expect(canTransition('exchanged', 'reserved')).toBe(false);
  });
});
