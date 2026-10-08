import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: vi.fn(),
  signInAsync: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_alg: string, raw: string) => `sha256:${raw}`,
  randomUUID: () => 'generated-uuid',
}));

import type { Session as SbSession } from '@supabase/supabase-js';
import { AuthFailure } from './providers/types';
import {
  hashNonce,
  signInWithAppleNative,
  type AppleAuthApi,
  type AppleIdTokenClient,
} from './appleSignIn';
import { socialMethodsOf } from './socialSignIn';

/**
 * THE NATIVE APPLE PATH, without a phone: Apple and Auth are handed in.
 */
describe('signInWithAppleNative', () => {
  const session = {
    access_token: 'a',
    refresh_token: 'r',
    user: { id: 'u1', email: 'parent@privaterelay.appleid.com' },
  } as unknown as SbSession;

  /** A stub Auth client: the real `signInWithIdToken` return type is wide; tests only read `session`. */
  const authOk = (s: SbSession | null = session): AppleIdTokenClient => ({
    signInWithIdToken: async () =>
      ({ data: { user: s?.user ?? null, session: s }, error: null }) as Awaited<
        ReturnType<AppleIdTokenClient['signInWithIdToken']>
      >,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes the raw nonce for Apple and passes the raw nonce to Supabase', async () => {
    const signInAsync = vi.fn(async () => ({ identityToken: 'id-token' }));
    const apple: AppleAuthApi = {
      isAvailableAsync: async () => true,
      signInAsync,
    };
    const signInWithIdToken = vi.fn(authOk().signInWithIdToken);
    const raw = 'raw-nonce-for-test';
    await signInWithAppleNative({
      auth: { signInWithIdToken },
      apple,
      rawNonce: raw,
    });
    expect(signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: await hashNonce(raw) }),
    );
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'id-token',
      nonce: raw,
    });
  });

  it('says cancelled when the parent backs out', async () => {
    const apple: AppleAuthApi = {
      isAvailableAsync: async () => true,
      signInAsync: async () => {
        const err = new Error('canceled') as Error & { code: string };
        err.code = 'ERR_REQUEST_CANCELED';
        throw err;
      },
    };
    await expect(
      signInWithAppleNative({
        auth: authOk(null),
        apple,
        rawNonce: 'n',
      }),
    ).rejects.toMatchObject({ code: 'cancelled' } satisfies Partial<AuthFailure>);
  });

  it('says not configured when this phone cannot do Sign in with Apple', async () => {
    const apple: AppleAuthApi = {
      isAvailableAsync: async () => false,
      signInAsync: async () => ({ identityToken: null }),
    };
    await expect(
      signInWithAppleNative({
        auth: authOk(null),
        apple,
        rawNonce: 'n',
      }),
    ).rejects.toMatchObject({ code: 'provider_not_configured' });
  });
});

describe('socialMethodsOf (which phone gets which button)', () => {
  const on = { google: true, apple: true, appleAndroid: true };
  const off = { google: false, apple: false, appleAndroid: false };

  it('gives an iPhone Apple when the iPhone switch is on, never the Android-only switch', () => {
    expect([...socialMethodsOf({ ...off, apple: true }, 'ios')]).toEqual(['apple']);
    expect([...socialMethodsOf({ ...off, appleAndroid: true }, 'ios')]).toEqual([]);
  });

  it('gives Android Apple only when the Android switch is on', () => {
    expect([...socialMethodsOf({ ...off, apple: true }, 'android')]).toEqual([]);
    expect([...socialMethodsOf({ ...off, appleAndroid: true }, 'android')]).toEqual(['apple']);
  });

  it('offers Google on both once its switch is on', () => {
    expect([...socialMethodsOf({ ...on, apple: false, appleAndroid: false }, 'ios')]).toEqual([
      'google',
    ]);
    expect([...socialMethodsOf({ ...on, apple: false, appleAndroid: false }, 'android')]).toEqual([
      'google',
    ]);
  });
});
