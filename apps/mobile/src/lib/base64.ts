/**
 * Base64, both ways, in about thirty lines.
 *
 * WHY NOT A DEPENDENCY, AND WHY NOT `atob`. The one caller is the baby's photo: `expo-file-system`
 * reads a file as a base64 string and Supabase Storage wants bytes, so something has to turn one
 * into the other. `atob`/`btoa` are a Hermes detail rather than a React Native guarantee — they
 * are present today and have been absent before — and a phone that cannot decode a string it just
 * encoded is a photo that silently never uploads. A polyfill package for a table lookup is a
 * dependency, a licence and a supply-chain surface for something the standard library of every
 * other runtime in this repo already has.
 *
 * Node's own `Buffer` proves it in the tests, so a typo in the table is caught rather than
 * round-tripped consistently wrong.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes → base64, no line breaks, padded. */
export function base64Of(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const left = bytes.length - i;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += left > 1 ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
    out += left > 2 ? ALPHABET[c & 63] : '=';
  }
  return out;
}

const INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  [...ALPHABET].map((ch, i) => [ch, i]),
);

/**
 * Base64 → bytes. Padding, whitespace and a `data:` prefix are all tolerated, because all three
 * turn up: a file read gives bare base64, a data URI gives a prefix, and a string that has been
 * through a JSON round trip can come back wrapped.
 *
 * A character that is not in the alphabet is SKIPPED rather than thrown on. The input is never
 * user text — it is a string this app or a platform API just produced — and a photo that fails
 * to upload because of one stray byte helps nobody.
 */
export function bytesOfBase64(input: string): Uint8Array {
  const body = input.slice(input.indexOf(',') + 1);
  const chars: number[] = [];
  for (const ch of body) {
    const v = INDEX[ch];
    if (v !== undefined) chars.push(v);
  }
  const out = new Uint8Array(Math.floor((chars.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < chars.length; i += 4) {
    const a = chars[i] ?? 0;
    const b = chars[i + 1] ?? 0;
    const c = chars[i + 2] ?? 0;
    const d = chars[i + 3] ?? 0;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
