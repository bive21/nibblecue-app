import { describe, expect, it } from 'vitest';
import { readEnv } from '../env';
import type { SocialMethod } from './providers/types';
import { socialButtons } from './socialSignIn';

/**
 * WHICH SOCIAL BUTTONS AUTH DRAWS (the launch review and the owner, 2026-09-27; Apple restored
 * 2026-10-02). A build offers only what it can finish; an iPhone never shows Google without Apple
 * (guideline 4.8); and Apple sits where Apple is the phone.
 */
const set = (...m: SocialMethod[]): ReadonlySet<SocialMethod> => new Set(m);
const NONE = { applePanel: false, appleSignInSide: false, google: false, anyOnPanel: false };

describe('a real build (the Supabase provider)', () => {
  it('draws no social button at all until a provider is switched on: email alone', () => {
    expect(socialButtons('android', set())).toEqual(NONE);
    expect(socialButtons('ios', set())).toEqual(NONE);
  });

  it('offers Google on Android once the owner has switched it on', () => {
    expect(socialButtons('android', set('google'))).toEqual({
      applePanel: false,
      appleSignInSide: false,
      google: true,
      anyOnPanel: true,
    });
  });

  it('keeps Google off an iPhone while there is no Sign in with Apple (guideline 4.8)', () => {
    expect(socialButtons('ios', set('google'))).toEqual(NONE);
  });
});

describe('a build that can finish both (the in-app test backend, or Apple once it is on)', () => {
  const both = set('apple', 'google');

  it('puts Apple on an iPhone’s panel, beside Google', () => {
    expect(socialButtons('ios', both)).toEqual({
      applePanel: true,
      appleSignInSide: false,
      google: true,
      anyOnPanel: true,
    });
  });

  it('keeps Apple off Android’s panel and gives it a quiet way back on the sign-in side', () => {
    expect(socialButtons('android', both)).toEqual({
      applePanel: false,
      appleSignInSide: true,
      google: true,
      anyOnPanel: true,
    });
  });

  it('shows Apple alone on an iPhone when Google is not on', () => {
    expect(socialButtons('ios', set('apple'))).toMatchObject({ applePanel: true, google: false });
  });
});

describe('the switches the owner sets once each provider is set up', () => {
  it('reads Google only when it says exactly true', () => {
    expect(readEnv({}).googleSignIn).toBe(false);
    expect(readEnv({ EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED: 'false' }).googleSignIn).toBe(false);
    expect(readEnv({ EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED: 'yes' }).googleSignIn).toBe(false);
    expect(readEnv({ EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED: ' TRUE ' }).googleSignIn).toBe(true);
  });

  it('reads Apple and Android-Apple the same way', () => {
    expect(readEnv({}).appleSignIn).toBe(false);
    expect(readEnv({}).appleAndroidSignIn).toBe(false);
    expect(readEnv({ EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: 'true' }).appleSignIn).toBe(true);
    expect(readEnv({ EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED: 'true' }).appleAndroidSignIn).toBe(
      true,
    );
  });
});
