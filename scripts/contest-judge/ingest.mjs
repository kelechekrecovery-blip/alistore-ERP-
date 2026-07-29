/**
 * Comment ingestion.
 *
 * Two shapes are accepted so the tool is not blocked on Graph API access:
 *  - Instagram Graph API `GET /{media-id}/comments` payloads
 *  - a plain array exported by hand (or by any scraper you already trust)
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

/** Instagram Graph API: `{ data: [{ id, username, text, timestamp, like_count }] }`. */
export function fromGraphApi(payload) {
  const rows = payload?.data;
  if (!Array.isArray(rows)) {
    throw new Error('Graph API payload must contain a "data" array of comments.');
  }

  return rows.map((row) => ({
    id: String(row.id),
    username: String(row.username ?? ''),
    text: String(row.text ?? ''),
    createdAt: String(row.timestamp ?? ''),
    likeCount: Number(row.like_count ?? 0),
  }));
}

/** A hand-exported array; missing ids are synthesised deterministically. */
export function fromPlainJson(payload) {
  if (!Array.isArray(payload)) {
    throw new Error('Expected an array of comments.');
  }

  return payload.map((row, index) => {
    const username = String(row.username ?? row.user ?? '');
    const text = String(row.text ?? row.comment ?? '');

    return {
      id: String(row.id ?? syntheticId(username, text, index)),
      username,
      text,
      createdAt: String(row.createdAt ?? row.timestamp ?? ''),
      likeCount: Number(row.likeCount ?? row.like_count ?? 0),
    };
  });
}

/**
 * Stable across re-runs of the same export: the fingerprint in the report stays
 * meaningful even when the source had no comment ids.
 */
function syntheticId(username, text, index) {
  return createHash('sha256')
    .update(`${index}${username}${text}`)
    .digest('hex')
    .slice(0, 16);
}

/** Reads a JSON file and picks the right adapter by shape. */
export function loadComments(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? fromPlainJson(parsed) : fromGraphApi(parsed);
}
