/**
 * Persistence for published draws.
 *
 * A result page is the whole point of the product: the organiser shares a link,
 * and participants open it to see who won and how to check it. So records are
 * append-only — once an id is published it can never be rewritten, because a
 * result page that can change silently is worth nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';

const ID_RE = /^[0-9a-z]{8}$/;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function createStore(directory) {
  fs.mkdirSync(directory, { recursive: true });

  /** Guarantees strictly increasing stamps even for saves in the same millisecond. */
  let lastStamp = 0;

  const fileFor = (id) => path.join(directory, `${id}.json`);

  function newId() {
    for (;;) {
      const id = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      if (!fs.existsSync(fileFor(id))) return id;
    }
  }

  function save(record, forcedId) {
    const id = forcedId ?? newId();

    if (!ID_RE.test(id)) throw new Error(`Malformed draw id: ${id}`);
    if (fs.existsSync(fileFor(id))) {
      throw new Error(`Draw ${id} is already published — results are immutable.`);
    }

    const stamp = Math.max(Date.now(), lastStamp + 1);
    lastStamp = stamp;

    const saved = { ...record, id, stamp, createdAt: new Date(stamp).toISOString() };
    fs.writeFileSync(fileFor(id), `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
    return saved;
  }

  /** Returns null rather than throwing: ids come straight from the URL bar. */
  function load(id) {
    if (!ID_RE.test(String(id ?? ''))) return null;

    try {
      return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
    } catch {
      return null;
    }
  }

  function list(limit = 20) {
    return fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => load(name.slice(0, -'.json'.length)))
      .filter(Boolean)
      .sort((a, b) => b.stamp - a.stamp)
      .slice(0, limit);
  }

  /**
   * Every draw ever run for the same post, oldest first.
   *
   * This is the anti-reroll disclosure. A one-click randomiser lets an organiser
   * keep drawing until they like the winner and publish only that one; listing
   * the siblings on the result page makes a second attempt visible to everyone
   * instead of silent.
   */
  function listByShortcode(shortcode) {
    if (!shortcode) return [];

    return fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => load(name.slice(0, -'.json'.length)))
      .filter((record) => record?.post?.shortcode === shortcode)
      .sort((a, b) => a.stamp - b.stamp);
  }

  return { save, load, list, listByShortcode, directory };
}
