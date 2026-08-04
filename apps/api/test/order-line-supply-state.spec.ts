import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  isSupplyFulfilled,
} from '../src/procurement/order-line-supply-state';
import { ValidationError } from '../src/common/errors';

describe('order-line supply state machine (pure)', () => {
  it('allows the canonical chain awaiting_supplier → ordered → in_transit → received → handed_over', () => {
    expect(canTransition('awaiting_supplier', 'ordered')).toBe(true);
    expect(canTransition('ordered', 'in_transit')).toBe(true);
    expect(canTransition('in_transit', 'received')).toBe(true);
    expect(canTransition('received', 'quality_check')).toBe(true);
    expect(canTransition('quality_check', 'ready')).toBe(true);
    expect(canTransition('ready', 'handed_over')).toBe(true);
  });

  it('allows the deposit-driven commercial chain', () => {
    expect(canTransition('awaiting_deposit', 'procurement_draft')).toBe(true);
    expect(canTransition('procurement_draft', 'ordered')).toBe(true);
  });

  it('forbids skipping a step', () => {
    expect(canTransition('awaiting_supplier', 'in_transit')).toBe(false);
    expect(canTransition('ordered', 'received')).toBe(false);
    expect(canTransition('awaiting_supplier', 'handed_over')).toBe(false);
    expect(canTransition('received', 'handed_over')).toBe(false);
  });

  it('allows cancellation from every non-terminal state', () => {
    expect(canTransition('awaiting_supplier', 'cancelled')).toBe(true);
    expect(canTransition('ordered', 'cancelled')).toBe(true);
    expect(canTransition('in_transit', 'cancelled')).toBe(true);
    expect(canTransition('received', 'cancelled')).toBe(true);
    expect(canTransition('quality_check', 'cancelled')).toBe(true);
    expect(canTransition('ready', 'cancelled')).toBe(true);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(ALLOWED_TRANSITIONS.handed_over).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(canTransition('handed_over', 'received')).toBe(false);
    expect(canTransition('cancelled', 'ordered')).toBe(false);
  });

  it('assertTransition throws a 422 ValidationError on an illegal edge', () => {
    let caught: unknown;
    try {
      assertTransition('received', 'ordered');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).getStatus()).toBe(422);
    expect((caught as ValidationError).code).toBe('illegal_supply_transition');
  });

  it('isSupplyFulfilled is true only once goods are received or handed over', () => {
    expect(isSupplyFulfilled('awaiting_supplier')).toBe(false);
    expect(isSupplyFulfilled('ordered')).toBe(false);
    expect(isSupplyFulfilled('in_transit')).toBe(false);
    expect(isSupplyFulfilled('received')).toBe(true);
    expect(isSupplyFulfilled('quality_check')).toBe(true);
    expect(isSupplyFulfilled('ready')).toBe(true);
    expect(isSupplyFulfilled('handed_over')).toBe(true);
  });
});
