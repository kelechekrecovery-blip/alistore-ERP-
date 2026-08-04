/**
 * Commit-reveal for the draw seed.
 *
 * The organiser generates a secret seed and publishes only its hash (the
 * commitment) BEFORE entries close. After the deadline the seed itself is
 * published, and anyone can check that it hashes to the commitment they saw
 * days earlier — so the seed cannot have been swapped for a friendlier one.
 */

import { createHash, randomBytes } from 'node:crypto';

const SEED_RE = /^[0-9a-f]{64}$/i;

/** 32 bytes of CSPRNG entropy, hex-encoded. */
export function generateSeed() {
  return randomBytes(32).toString('hex');
}

export function createCommitment(seed) {
  assertSeed(seed);
  return createHash('sha256').update(String(seed).toLowerCase()).digest('hex');
}

export function verifyCommitment(seed, commitment) {
  if (!SEED_RE.test(String(seed ?? ''))) return false;
  return createCommitment(seed) === String(commitment ?? '').toLowerCase();
}

function assertSeed(seed) {
  if (!SEED_RE.test(String(seed ?? ''))) {
    throw new Error('The seed must be 64 hex characters (32 bytes).');
  }
}
