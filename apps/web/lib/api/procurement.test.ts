import { describe, expect, it } from 'vitest';
import { formatResolutionRate } from './procurement';

/**
 * A supplier with only open RMAs has no resolution rate yet. It must read as «—»,
 * not 0%, so «nothing closed yet» is not confused with «everything rejected».
 */
describe('formatResolutionRate', () => {
  it('shows a dash when there are no closed cases', () => {
    expect(formatResolutionRate(null)).toBe('—');
  });

  it('renders a rounded percentage', () => {
    expect(formatResolutionRate(1)).toBe('100%');
    expect(formatResolutionRate(0)).toBe('0%');
    expect(formatResolutionRate(0.666)).toBe('67%');
  });
});
