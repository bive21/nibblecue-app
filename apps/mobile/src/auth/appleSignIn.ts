/**
 * SIGN IN WITH APPLE ON AN IPHONE (docs/AUTH_AND_TRIAL.md §2.0, docs/LAUNCH_GUIDE.md Phase 5).
 *
 * Native `expo-apple-authentication` → Supabase `signInWithIdToken`. Apple gets a SHA-256 of a
 * raw nonce; Supabase gets the raw nonce and hashes it again to match the id token's claim
 * (supabase.com/docs/guides/auth/social-login/auth-apple). The app never holds an Apple key —
 * the bundle id is the client id, and the project's Apple provider is switched on by the owner.
 *
 * Expo Go on iOS carries this module (`expo/bundledNativeModules.json`), so a static import is
 * fine: it is not in the Expo Go deny-list (`tools/expo-go-imports.mjs`).
 *
 * Pure but for the two things handed in (Apple API and the auth client), so the node suite runs
 * the flow without a phone (`appleSignIn.test.ts`).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { Session as SbSession, SupabaseClient } from '@supabase/supabase-js';
import { AuthFailure } from './providers/types';

/** The Apple calls this flow makes — injectable so the node suite does not need a device. */
export interface AppleAuthApi {
  isAvailableAsync(): Promise<boolean>;
  signInAsync(options: {
    requestedScopes: AppleAuthentication.AppleAuthenticationScope[];
    nonce: string;
  }): Promise<{ identityToken: string | null }>;
}

/** The one supabase-js call the native path makes. */
export type AppleIdTokenClient = Pick<SupabaseClient['auth'], 'signInWithIdToken'>;

const SCOPES = [
  AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
  AppleAuthentication.AppleAuthenticationScope.EMAIL,
];

/** SHA-256 hex of `raw`, what Apple wants in `signInAsync({ nonce })`. */
export async function hashNonce(raw: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
}

/**
 * Ask Apple, then hand the identity token to Supabase. Throws `AuthFailure`:
 *   - `cancelled` when the parent closes or refuses the sheet
 *   - `provider_not_configured` when this phone cannot do Sign in with Apple
 *   - `unknown` when Apple or Auth returns nothing usable
 */
export async function signInWithAppleNative(input: {
  auth: AppleIdTokenClient;
  apple?: AppleAuthApi;
  /** Injected for tests; production makes a fresh UUID. */
  rawNonce?: string;
}): Promise<SbSession> {
  const apple = input.apple ?? AppleAuthentication;
  if (!(await apple.isAvailableAsync())) {
    throw new AuthFailure('provider_not_configured', 'Sign in with Apple is not available here');
  }
  const rawNonce = input.rawNonce ?? Crypto.randomUUID();
  const hashedNonce = await hashNonce(rawNonce);

  let credential: { identityToken: string | null };
  try {
    credential = await apple.signInAsync({ requestedScopes: SCOPES, nonce: hashedNonce });
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    // Expo and Apple both use this code when the parent backs out
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      throw new AuthFailure('cancelled');
    }
    throw new AuthFailure('unknown');
  }

  if (!credential.identityToken) throw new AuthFailure('unknown');

  const { data, error } = await input.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error !== null) {
    // AuthFailure codes from GoTrue: reuse the same mapping the password path uses where it fits
    const msg = error.message ?? '';
    if (/already (?:exists|registered|in use|linked)|same email|multiple accounts/i.test(msg)) {
      throw new AuthFailure('account_exists');
    }
    throw new AuthFailure('unknown', error.message);
  }
  if (!data.session) throw new AuthFailure('unknown');
  return data.session;
}
