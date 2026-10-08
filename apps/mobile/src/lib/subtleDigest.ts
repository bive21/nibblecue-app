/**
 * THE ONE PIECE OF WEBCRYPTO THE SIGN-IN FLOWS NEED (the owner's Expo Go log, 2026-09-30:
 * *"WebCrypto API is not supported. Code challenge method will default to use plain instead of
 * sha256."*).
 *
 * Every emailed link (verify, reset) and Google's browser sign-in is PKCE: the phone keeps a secret
 * verifier and sends the server a CHALLENGE made from it. supabase-js makes that challenge with
 * `crypto.subtle.digest('SHA-256', …)` when the runtime has WebCrypto, and otherwise sends the
 * verifier itself as the challenge ("plain"), with that warning. Hermes has no `crypto.subtle`, so
 * every flow was plain: the secret the scheme exists to keep on the phone travelled in the address
 * the browser and the mail app can see. The server takes either; S256 is the one that keeps it.
 *
 * So `installSubtleDigest` puts `crypto.subtle.digest`, and only that, on a native digest
 * (`expo-crypto`'s, wired in `webCrypto.ts`, which Expo Go and every build carry: no new native
 * module). `react-native-get-random-values` has already made `globalThis.crypto` for
 * `getRandomValues`; this adds `subtle` to it once and never replaces one that is already there.
 *
 * ONLY `digest`. supabase-js's `getClaims()` reads the presence of `crypto.subtle` as the whole of
 * WebCrypto and would call `importKey` and `verify` on it. The app never calls `getClaims`
 * (`subtleDigest.test.ts` scans the source for it); one that reached here would throw rather than
 * pass a token it had not verified.
 *
 * Pure, with the native digest passed in, so node tests exactly what the phone runs.
 */

/** The digests WebCrypto names and expo-crypto's `CryptoDigestAlgorithm` spells the same way. */
export type DigestName = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

const DIGESTS: ReadonlySet<string> = new Set<DigestName>([
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
]);

/** The native digest: an algorithm and bytes in, the hash's bytes out. */
export type NativeDigest = (algorithm: DigestName, data: BufferSource) => Promise<ArrayBuffer>;

/**
 * WebCrypto's algorithm argument, a name or `{ name }`, in the case WebCrypto allows (it matches
 * names without regard to case), as the name the native digest knows. Anything else is refused the
 * way WebCrypto refuses it: a rejected promise, never a hash of the wrong kind.
 */
export function digestName(algorithm: unknown): DigestName | null {
  const raw =
    typeof algorithm === 'string'
      ? algorithm
      : typeof algorithm === 'object' && algorithm !== null && 'name' in algorithm
        ? (algorithm as { name: unknown }).name
        : null;
  if (typeof raw !== 'string') return null;
  const name = raw.toUpperCase();
  return DIGESTS.has(name) ? (name as DigestName) : null;
}

/** Whether a runtime already has a `crypto.subtle` of its own. */
function hasSubtle(target: { crypto?: unknown }): boolean {
  const c = target.crypto;
  return typeof c === 'object' && c !== null && (c as { subtle?: unknown }).subtle !== undefined;
}

/**
 * Give `target.crypto` a `subtle` whose `digest` runs on `native`. A no-op where `crypto.subtle`
 * already exists, and where there is no `crypto` object at all to add it to (the random-values
 * polyfill, imported first, is what makes one). Returns whether it installed anything.
 *
 * It NEVER THROWS: it runs as `index.ts` loads, before the app has a screen to fail on, so a
 * runtime whose own `crypto` is frozen or sealed gets no shim (sign-in stays on plain, as before)
 * rather than an app that cannot start.
 */
export function installSubtleDigest(target: { crypto?: unknown }, native: NativeDigest): boolean {
  const c = target.crypto;
  if (typeof c !== 'object' || c === null || hasSubtle(target) || !Object.isExtensible(c))
    return false;
  const subtle = {
    digest(algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> {
      const name = digestName(algorithm);
      if (name === null)
        return Promise.reject(new Error(`Unrecognized digest algorithm: ${String(algorithm)}`));
      return native(name, data);
    },
  };
  try {
    Object.defineProperty(c, 'subtle', { value: subtle, configurable: true, enumerable: true });
  } catch {
    return false;
  }
  return true;
}
