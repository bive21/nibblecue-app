/**
 * The two pieces of a deep link the auth flow reads — the query and the fragment — parsed
 * without the platform's URL class. React Native's URL and URLSearchParams are partial
 * implementations, and a custom scheme (`cuddlecue://auth/callback?code=…`) is exactly the
 * kind of URL they handle unevenly; a few lines of string work are reliable everywhere.
 */

function parsePairs(part: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!part) return out;
  for (const pair of part.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = decode(i === -1 ? pair : pair.slice(0, i));
    const value = i === -1 ? '' : decode(pair.slice(i + 1));
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** `?a=1&b=2` of a URL, before any fragment. */
export function queryOf(url: string): Record<string, string> {
  const noFragment = url.split('#')[0] ?? '';
  const q = noFragment.indexOf('?');
  return q === -1 ? {} : parsePairs(noFragment.slice(q + 1));
}

/** `#access_token=…&type=recovery` of a URL — where Supabase Auth puts implicit-flow tokens. */
export function fragmentOf(url: string): Record<string, string> {
  const h = url.indexOf('#');
  return h === -1 ? {} : parsePairs(url.slice(h + 1));
}
