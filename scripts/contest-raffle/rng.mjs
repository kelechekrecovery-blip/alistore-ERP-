/**
 * Deterministic randomness for the draw.
 *
 * `Math.random` is unusable here for two reasons: it is not reproducible, so
 * nobody could re-run the draw and check it, and it is not seedable, so there
 * would be nothing to commit to in advance. This is an HMAC-SHA256 DRBG in
 * counter mode — same material in, same stream out, forever.
 */

import { createHash, createHmac } from 'node:crypto';

const UINT32_SPACE = 0x1_0000_0000;

export function createDrbg(material) {
  const key = createHash('sha256').update(String(material)).digest();

  let counter = 0n;
  let block = Buffer.alloc(0);
  let offset = 0;

  function refill() {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(counter);
    counter += 1n;
    block = createHmac('sha256', key).update(message).digest();
    offset = 0;
  }

  function nextUint32() {
    if (offset + 4 > block.length) refill();
    const value = block.readUInt32BE(offset);
    offset += 4;
    return value;
  }

  /**
   * Uniform integer in [0, bound).
   *
   * Plain `% bound` would skew the result toward the low values whenever bound
   * does not divide 2^32 — with 3117 entrants that bias is real and would show
   * up as some accounts being quietly likelier to win. Rejection sampling
   * removes it.
   */
  function nextBelow(bound) {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error('nextBelow requires a positive integer bound.');
    }

    const limit = Math.floor(UINT32_SPACE / bound) * bound;

    let value = nextUint32();
    while (value >= limit) value = nextUint32();

    return value % bound;
  }

  return { nextUint32, nextBelow };
}
