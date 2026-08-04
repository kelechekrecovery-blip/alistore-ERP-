/**
 * Forgiving comment input.
 *
 * Until Graph API access is wired up, organisers paste what they have. That is
 * usually one of two things: a JSON export, or a plain list of usernames copied
 * off the screen. Both are accepted; anything else fails with a message that
 * says what was expected.
 */

import { fromGraphApi, fromPlainJson } from '../contest-judge/ingest.mjs';

const LINE_RE = /^@?([A-Za-z0-9._]{1,30})\s*(?:[:—–-]\s*(.*))?$/;

export function parseCommentsInput(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') throw new Error('Список участников пуст.');

  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? fromPlainJson(parsed) : fromGraphApi(parsed);
  }

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const comments = [];

  lines.forEach((line, index) => {
    const match = line.match(LINE_RE);
    if (!match) {
      throw new Error(
        `Строка ${index + 1} не разобралась: «${line.slice(0, 40)}». ` +
          'Ожидается «username» или «username — текст комментария».',
      );
    }

    const [, username, body] = match;
    comments.push({
      id: String(index + 1),
      username,
      // A username-only list has no text to judge; the handle stands in so the
      // entry is not screened out as empty, and repeats still collapse per user.
      text: (body ?? '').trim() || username,
      createdAt: '',
      likeCount: 0,
    });
  });

  return comments;
}
