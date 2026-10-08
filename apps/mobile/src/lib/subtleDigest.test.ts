/**
 * `crypto.subtle.digest` for supabase-js's PKCE (`subtleDigest.ts`): installed once, never over a
 * real one, refusing what it cannot hash, and what supabase-js asks of it answered exactly as
 * WebCrypto would. Node's own WebCrypto stands in for the phone's native digest, so the S256
 * challenge made through the shim is checked byte for byte against the real thing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digestName, installSubtleDigest, type NativeDigest } from './subtleDigest';

const native: NativeDigest = (name, data) => webcrypto.subtle.digest(name, data);

describe('crypto.subtle.digest on a runtime without WebCrypto', () => {
  it('reads a name or { name }, in any case, and refuses anything else', () => {
    expect(digestName('SHA-256')).toBe('SHA-256');
    expect(digestName('sha-256')).toBe('SHA-256');
    expect(digestName({ name: 'SHA-512' })).toBe('SHA-512');
    expect(digestName('MD5')).toBeNull();
    expect(digestName({ name: 7 })).toBeNull();
    expect(digestName(null)).toBeNull();
  });

  it('adds subtle.digest beside getRandomValues, once', () => {
    const getRandomValues = () => undefined;
    const target: { crypto?: unknown } = { crypto: { getRandomValues } };
    expect(installSubtleDigest(target, native)).toBe(true);
    const c = target.crypto as { getRandomValues: unknown; subtle: { digest: unknown } };
    expect(c.getRandomValues).toBe(getRandomValues);
    expect(typeof c.subtle.digest).toBe('function');
    // a second install leaves the first alone
    const first = c.subtle;
    expect(installSubtleDigest(target, native)).toBe(false);
    expect(c.subtle).toBe(first);
  });

  it('never replaces a real crypto.subtle, and needs a crypto object to add to', () => {
    const real = { digest: () => Promise.resolve(new ArrayBuffer(0)) };
    const target: { crypto?: unknown } = { crypto: { subtle: real } };
    expect(installSubtleDigest(target, native)).toBe(false);
    expect((target.crypto as { subtle: unknown }).subtle).toBe(real);
    expect(installSubtleDigest({}, native)).toBe(false);
  });

  it('leaves a frozen crypto alone instead of throwing at boot', () => {
    const frozen = Object.freeze({ getRandomValues: () => undefined });
    const target: { crypto?: unknown } = { crypto: frozen };
    expect(() => installSubtleDigest(target, native)).not.toThrow();
    expect(installSubtleDigest(target, native)).toBe(false);
    expect((target.crypto as { subtle?: unknown }).subtle).toBeUndefined();
  });

  it('makes the S256 challenge supabase-js would make with real WebCrypto', async () => {
    const target: { crypto?: unknown } = { crypto: {} };
    installSubtleDigest(target, native);
    const shim = (target.crypto as { subtle: SubtleCrypto }).subtle;
    // supabase-js's own steps (auth-js helpers `sha256` and `generatePKCEChallenge`)
    const challenge = async (subtle: Pick<SubtleCrypto, 'digest'>, verifier: string) => {
      const hash = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const bytes = Array.from(new Uint8Array(hash), b => String.fromCharCode(b)).join('');
      return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    // RFC 7636 appendix B: this verifier's S256 challenge
    expect(await challenge(shim, verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(await challenge(shim, verifier)).toBe(await challenge(webcrypto.subtle, verifier));
    await expect(shim.digest('MD5', new Uint8Array(1))).rejects.toThrow(/Unrecognized/);
  });
});

/**
 * THE SHIM IS `digest` ALONE. supabase-js's `getClaims()` takes any `crypto.subtle` for the whole
 * of WebCrypto and would call `importKey` and `verify` on this one, so nothing in the app may call
 * it: the session's user comes from `getUser`/`getSession`, which never touch `subtle`.
 */
describe('nothing asks the shim for more than a digest', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
    });

  it('no source calls getClaims', () => {
    // a call is a method on the auth client (`auth.getClaims(`); the word in a comment is not one
    const callers = files(SRC).filter(p => /\.getClaims\s*\(/.test(readFileSync(p, 'utf8')));
    expect(callers).toEqual([]);
  });

  it('index.ts installs it right after the random-values polyfill', () => {
    const index = readFileSync(join(SRC, '..', 'index.ts'), 'utf8');
    const rv = index.indexOf("import 'react-native-get-random-values';");
    const wc = index.indexOf("import './src/lib/webCrypto';");
    expect(rv).toBeGreaterThan(-1);
    expect(wc).toBeGreaterThan(rv);
    // before App, whose imports reach supabase-js
    expect(wc).toBeLessThan(index.indexOf("import App from './App';"));
  });
});
