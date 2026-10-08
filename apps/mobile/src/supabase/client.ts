/**
 * The one Supabase client the app ever builds.
 *
 * WP2 created the client inside `createSupabaseProviders`, which was right while auth was the
 * only thing talking to the server. WP4 adds a second caller — `SupabaseSyncApi` — and a second
 * `createClient` would be a second session store over the same keychain entry: two refresh
 * timers racing one refresh token, and a `sync_push` sent under a token the other client has
 * already rotated. supabase-js warns about multiple GoTrue instances for exactly this reason.
 *
 * So the client is memoized on `(url, anonKey)`. Two different projects — a dev build switching
 * URLs — get two clients, which is correct; the same project asked for twice gets one.
 *
 * `auth.storage` stays `supabaseSessionStorage`, the keychain-backed store WP2 wrote and the one
 * sign-out's teardown clears. Nothing here reads or invents a credential: both values are handed
 * in by `env.ts` from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
 */
import type { Database } from '@nibblecue/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseSessionStorage } from '../auth/keychain';

/** The app's client. Named for what it is rather than for the product: `brand.test.ts` scans
 *  every tracked file and the product name may not be typed into the app, identifier or not. */
export type AppSupabaseClient = SupabaseClient<Database>;

const clients = new Map<string, AppSupabaseClient>();

/** The project's client, created once per `(url, anonKey)` pair. */
export function getSupabaseClient(url: string, anonKey: string): AppSupabaseClient {
  const key = `${url} ${anonKey}`;
  const existing = clients.get(key);
  if (existing !== undefined) return existing;
  const client = createClient<Database>(url, anonKey, {
    auth: {
      storage: supabaseSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  clients.set(key, client);
  return client;
}
