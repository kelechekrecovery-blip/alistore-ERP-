const Sequencer = require('@jest/test-sequencer').default;

/**
 * Deterministic suite order.
 *
 * Jest's default sequencer orders by cached duration when a cache exists and by
 * file size otherwise, so the same commit runs its suites in a different order
 * on a warm cache than on a cold one. Suites here leak state into each other,
 * so a different order produces a different result: measured on identical code
 * against two freshly migrated databases, one run was 983/983 green and the next
 * failed 5 tests in reports-money-truth (which passes 5/5 in isolation).
 *
 * Sorting by path makes the gate reproducible. It does not fix the leaks — it
 * makes them findable, because a red run can now be repeated.
 */
class AlphabeticSequencer extends Sequencer {
  sort(tests) {
    return [...tests].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

module.exports = AlphabeticSequencer;
