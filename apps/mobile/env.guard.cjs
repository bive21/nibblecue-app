/**
 * WHAT A PRODUCTION BUILD MAY NOT BE: THE MOCK.
 *
 * `src/env.ts` falls back to the mock provider whenever the Supabase values are missing, which
 * is exactly right for a developer's phone and exactly wrong for the store — a release built
 * with the keys forgotten would have signed every parent into a backend that lives on their own
 * phone, with nothing shared and nothing recoverable, and nothing on the screen would have said
 * so. `app.config.ts` calls this before any production build and refuses to proceed on a
 * non-null answer — where the app is built or bundled (`guardApplies`, below) — and the sentence
 * names the missing value so the fix is the value, not a search.
 *
 * PLAIN COMMONJS, ON PURPOSE. Expo's config loader compiles `app.config.ts` and `require`s its
 * imports with Node's own resolver, which cannot load a `.ts` file — an import of `./src/env`
 * fails with "Cannot find module" before any build starts. This file has no imports and no
 * types to strip, so it loads under the config loader, under Metro and under vitest alike
 * (`src/env.test.ts` holds it to its claims).
 *
 * @param {{ EXPO_PUBLIC_ENV?: string; EXPO_PUBLIC_AUTH_PROVIDER?: string; EXPO_PUBLIC_SUPABASE_URL?: string; EXPO_PUBLIC_SUPABASE_ANON_KEY?: string }} raw
 * @returns {string | null} what is wrong, or null when a production build may proceed
 */
function productionEnvProblem(raw) {
  if ((raw.EXPO_PUBLIC_ENV ?? '').trim() !== 'production') return null;
  const url = (raw.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (raw.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const provider = (raw.EXPO_PUBLIC_AUTH_PROVIDER ?? '').trim().toLowerCase();
  const missing = [
    url ? null : 'EXPO_PUBLIC_SUPABASE_URL',
    key ? null : 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    provider === 'supabase' ? null : 'EXPO_PUBLIC_AUTH_PROVIDER=supabase',
  ].filter(Boolean);
  if (missing.length > 0) {
    return `A production build cannot run on the mock backend. Set ${missing.join(', ')} (EAS secrets or the build profile's env).`;
  }
  if (!/^https:\/\//.test(url)) {
    return 'EXPO_PUBLIC_SUPABASE_URL must be an https:// URL in a production build.';
  }
  return null;
}

/**
 * WHERE THE GUARD HOLDS: where the app is BUILT or BUNDLED — never where it is only READ.
 *
 * EAS reads `app.config.ts` on the owner's computer before it has the EAS environment's values.
 * `eas build` and `eas update` each evaluate it first with nothing but the build profile's `env`
 * (the stage and the provider — not the server's URL or key), only to learn the project id, and
 * fetch the environment after (eas-cli 24: `evaluateConfigWithEnvVarsAsync`, and update's
 * `DynamicProjectConfigContextField`). Refused on that read, every production build and every
 * update stopped before it began, naming values that were already set (the checklist audit,
 * 2026-09-25, reproduced with eas-cli 24.8.0's own functions). The guard holds where the app is
 * actually made, with the environment loaded:
 *
 *   - on an EAS build worker (`EAS_BUILD=true`): prebuild and the JS bundle, so a build missing a
 *     value still stops with it named;
 *   - in `expo export` (and `export:embed`), which is how `eas update` bundles on this computer,
 *     so an update missing a value is refused before anything is uploaded.
 *
 * Everywhere else — eas-cli's own read, `expo start`, `expo config` — it is a reading, and a
 * reading makes nothing that could run on the mock. (`releaseEnvProblem` in `src/env.ts` is the
 * last line behind this one: a store build that somehow got through stops at an error screen.)
 *
 * @param {{ readonly [name: string]: string | undefined }} env  the process environment
 * @param {readonly string[]} args  the command's arguments, `process.argv.slice(2)`
 * @returns {boolean}
 */
function guardApplies(env, args) {
  if ((env.EAS_BUILD ?? '').trim() === 'true') return true;
  return args.some(a => a === 'export' || a.startsWith('export:'));
}

module.exports = { productionEnvProblem, guardApplies };

/**
 * NO RELEASE ON A PROPOSAL (NibbleCue, 2026-10-08). The bundle id, the scheme, the App Group, the
 * link path and the EAS project are set ONCE by the owner and never changed after the first
 * submission (bpnc-studio engineering.md, "Identifiers"). Until the owner confirms them they live
 * in brand.json's `proposed` section (or as a `{{PLACEHOLDER}}` in `unconfirmed`), a development
 * build runs on them so the app can be tested, and a release build stops here with the keys named.
 *
 * @param {{ proposed: Record<string, unknown>; unconfirmed: Record<string, unknown> }} brand
 * @returns {string | null}
 */
function identifierProblem(brand) {
  const proposed = Object.keys(brand.proposed).filter(k => !k.startsWith('$'));
  const eas = String(brand.unconfirmed.easProjectId ?? '');
  const missing = [...proposed, ...(/^\{\{.+\}\}$/.test(eas) ? ['easProjectId'] : [])];
  if (missing.length === 0) return null;
  return `A release build needs the owner's identifiers. Still proposed or missing in packages/brand/brand.json: ${missing.join(', ')}.`;
}

module.exports.identifierProblem = identifierProblem;
