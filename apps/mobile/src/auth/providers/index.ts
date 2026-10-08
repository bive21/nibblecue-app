/**
 * Which provider pair the build runs on (docs/ACCOUNTS.md §2). `mock` needs no keys and is
 * the default; `supabase` needs EXPO_PUBLIC_SUPABASE_URL and the publishable key, and is
 * chosen only when both exist (env.ts). Screens never know which one they got.
 */
import type { KeyValueStore } from '../../prefs';
import type { AppEnv } from '../../env';
import type { SessionStore } from './types';
import type { AccountsApi, AuthProvider } from './types';
import { MockAccountsApi, MockAuthProvider, MockBackend } from './mock';
import { createSupabaseProviders } from './supabase';

export interface Providers {
  auth: AuthProvider;
  api: AccountsApi;
  /** Present on the mock only: the dev-only "open the link" button and the E2E hooks read it. */
  mock: MockBackend | null;
}

export async function createProviders(
  env: AppEnv,
  deps: { sessionStore: SessionStore; mockStateStore: KeyValueStore },
): Promise<Providers> {
  if (env.authProvider === 'supabase' && env.supabaseUrl && env.supabaseAnonKey) {
    // each social once the owner has switched that provider on and said so (env.ts)
    const social = {
      google: env.googleSignIn,
      apple: env.appleSignIn,
      appleAndroid: env.appleAndroidSignIn,
    };
    return {
      ...createSupabaseProviders(env.supabaseUrl, env.supabaseAnonKey, social),
      mock: null,
    };
  }
  const backend = new MockBackend({ store: deps.mockStateStore });
  await backend.load();
  const auth = new MockAuthProvider(backend, deps.sessionStore);
  return { auth, api: new MockAccountsApi(backend, auth), mock: backend };
}
