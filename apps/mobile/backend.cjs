'use strict';
/**
 * WHICH BACKEND A BUILD'S SETTINGS PICK — one rule, read in the two places that must agree.
 *
 *   · `src/env.ts` `readEnv`, on the phone, from the values Metro inlined into the bundle;
 *   · `metro.config.js`, while Metro bundles, from the environment it is bundling with: a release
 *     bundle whose settings pick the server can never run on the test backend, so its code is
 *     left out of that bundle (the config says what, and why that is safe).
 *
 * The server needs all three: the provider named, and both the URL and the publishable key.
 * Anything else, nothing included, is the test backend (CLAUDE.md rule 11: no credential is
 * invented). `productionEnvProblem` in `env.guard.cjs` refuses a production build that would
 * land here on `mock`.
 *
 * PLAIN COMMONJS for the second reader: Metro loads its config with Node's own `require`, which
 * cannot load a `.ts` file. No imports, no types to strip. NOT in `env.guard.cjs`, because
 * `app.config.ts` loads that file and so the runtime fingerprint hashes it: a change there is a
 * new runtime version, and no update would reach the builds already made. Nothing the config
 * loads may import this file for the same reason (`src/metro-config.test.ts`).
 *
 * @param {{ EXPO_PUBLIC_AUTH_PROVIDER?: string; EXPO_PUBLIC_SUPABASE_URL?: string; EXPO_PUBLIC_SUPABASE_ANON_KEY?: string }} raw
 * @returns {'mock' | 'supabase'}
 */
function backendOf(raw) {
  const wanted = (raw.EXPO_PUBLIC_AUTH_PROVIDER ?? '').trim().toLowerCase();
  const url = (raw.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (raw.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  return wanted === 'supabase' && url !== '' && key !== '' ? 'supabase' : 'mock';
}

module.exports = { backendOf };
