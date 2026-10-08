/** Which backend these settings pick: the server only with all three (`backend.cjs`). */
export function backendOf(raw: {
  EXPO_PUBLIC_AUTH_PROVIDER?: string | undefined;
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
}): 'mock' | 'supabase';
