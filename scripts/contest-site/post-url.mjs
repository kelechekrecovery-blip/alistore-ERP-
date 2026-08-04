/**
 * Parsing the contest post link a user pastes in.
 *
 * Only the shortcode matters downstream (it identifies the media for the Graph
 * API), but validating here means a typo fails on the form rather than three
 * steps later with a confusing error.
 */

const POST_PATH = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/;

export function parsePostUrl(raw) {
  const trimmed = String(raw ?? '').trim();

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Это не похоже на ссылку. Вставьте ссылку на конкурсный пост.');
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'instagram.com') {
    throw new Error('Пока поддерживается только Instagram.');
  }

  const match = url.pathname.match(POST_PATH);
  if (!match) {
    throw new Error('Нужна ссылка на конкретный пост или рилс, а не на профиль.');
  }

  return { network: 'instagram', shortcode: match[1], url: trimmed };
}
