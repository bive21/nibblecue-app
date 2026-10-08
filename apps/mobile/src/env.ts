/**
 * Build-time configuration. Expo inlines `process.env.EXPO_PUBLIC_*` only where the name is
 * written out literally, so every variable is read here, once, by its full name. Nothing here
 * is a secret: the publishable key is public by design, and there is no service-role key in
 * any client bundle (.env.example). No credential is invented: with no URL and key the app
 * runs on the mock provider (CLAUDE.md rule 11).
 */

import { backendOf } from '../backend.cjs';

export type AuthProviderName = 'mock' | 'supabase';

export interface AppEnv {
  authProvider: AuthProviderName;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  stage: 'development' | 'staging' | 'production';
  /**
   * WHETHER COMMUNITY HAS A SERVER TO REACH: on every build with one, staging's Expo Go as much as
   * a store build. It was a switch each build had to carry (`EXPO_PUBLIC_COMMUNITY_ENABLED=true`),
   * so staging, whose Expo Go settings name only the server, kept every post on the phone, and a
   * store build that missed the variable would have done the same with nothing on the page but a
   * line at the top (the owner, 2026-09-28: "why wouldnt it be available on staging DB?"). The
   * variable now only takes it away (`false`); the in-app test server never has one.
   */
  communityEnabled: boolean;
  /**
   * Subsystems held back for one run, to find a crash nobody can read (`EXPO_PUBLIC_OFF`, a
   * comma-separated list). A native crash takes the app down without reaching JavaScript, so
   * neither the error screen nor the terminal sees it; the only way in is to remove one
   * suspect at a time. Development only — `readEnv` ignores it in production — and every name
   * leaves the app usable, so a run still says whether the crash went away.
   */
  off: ReadonlySet<OffSwitch>;
  /**
   * RevenueCat's PUBLIC SDK keys, one per platform (`goog_…`, `appl_…`). Public by design, like the
   * publishable key: each only lets this app ask RevenueCat about the signed-in person's own
   * purchases. Null until the owner makes the RevenueCat project (docs/SUBSCRIPTIONS.md §13), and
   * without one this build sells nothing (`billing/BillingContext.tsx`).
   */
  revenueCat: { android: string | null; ios: string | null };
  /**
   * GOOGLE SIGN-IN IS SWITCHED ON AT THE SERVER, and this build may offer it
   * (`EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED=true`; the owner, 2026-09-27: "add google"). The app
   * cannot see whether the Supabase project has its Google provider on: a button drawn before it
   * is would open a browser page that says the provider is not enabled, which is the "control that
   * does not work" App Review rejects. So the owner sets this once Google is set up
   * (docs/LAUNCH_GUIDE.md Phase 5), and until then the button is not drawn. Read only by the
   * Supabase provider; the in-app test backend offers Google whatever this says.
   */
  googleSignIn: boolean;
  /**
   * SIGN IN WITH APPLE ON AN IPHONE (`EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true`; the owner,
   * 2026-10-02: enable Apple so Google can stand beside it under guideline 4.8). Same reason as
   * Google: the app cannot see Supabase's Apple provider, so the owner sets this once the App ID
   * capability and the Supabase Apple provider are on (LAUNCH_GUIDE Steps 5.8–5.9).
   */
  appleSignIn: boolean;
  /**
   * THE QUIET "SIGN IN WITH APPLE" ON ANDROID (`EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED=true`).
   * Needs a Services ID and a rotating secret (LAUNCH_GUIDE Step 5.10). Off until then so Android
   * never draws a button that opens a broken page. Independent of the iPhone switch.
   */
  appleAndroidSignIn: boolean;
}

/**
 * What can be held back. `sync` keeps the local database and stops the loop that talks;
 * `widgets` computes the timelines and hands none to the widget runtime.
 */
const OFF_SWITCHES = ['sync', 'notifications', 'ground', 'widgets'] as const;
export type OffSwitch = (typeof OFF_SWITCHES)[number];

export interface RawEnv {
  EXPO_PUBLIC_AUTH_PROVIDER?: string | undefined;
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
  EXPO_PUBLIC_ENV?: string | undefined;
  EXPO_PUBLIC_COMMUNITY_ENABLED?: string | undefined;
  EXPO_PUBLIC_OFF?: string | undefined;
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string | undefined;
  EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string | undefined;
  EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED?: string | undefined;
  EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED?: string | undefined;
  EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED?: string | undefined;
}

export function readEnv(raw: RawEnv = fromProcess()): AppEnv {
  const url = raw.EXPO_PUBLIC_SUPABASE_URL?.trim() || null;
  const key = raw.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  // `supabase` needs both values; anything else, including nothing, is the mock. The rule is
  // `backend.cjs`'s, because Metro reads it too: a release bundle it picks the server for is
  // bundled without the mock (metro.config.js), so the two must never disagree.
  const authProvider: AuthProviderName = backendOf(raw);
  const stageRaw = raw.EXPO_PUBLIC_ENV?.trim();
  const stage = stageRaw === 'production' || stageRaw === 'staging' ? stageRaw : 'development';
  const communityEnabled =
    authProvider === 'supabase' &&
    raw.EXPO_PUBLIC_COMMUNITY_ENABLED?.trim().toLowerCase() !== 'false';
  const named = (raw.EXPO_PUBLIC_OFF ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((s): s is OffSwitch => (OFF_SWITCHES as readonly string[]).includes(s));
  const off: ReadonlySet<OffSwitch> = new Set(stage === 'production' ? [] : named);
  const revenueCat = {
    android: raw.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim() || null,
    ios: raw.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || null,
  };
  // `true` and nothing else: a typo leaves the button off, never on
  const googleSignIn = raw.EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true';
  const appleSignIn = raw.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true';
  const appleAndroidSignIn =
    raw.EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true';
  return {
    authProvider,
    supabaseUrl: url,
    supabaseAnonKey: key,
    stage,
    communityEnabled,
    off,
    revenueCat,
    googleSignIn,
    appleSignIn,
    appleAndroidSignIn,
  };
}

/**
 * A STORE BUILD NEVER RUNS ON THE TEST BACKEND (docs/RELEASES.md §4).
 *
 * `readEnv` falls back to the mock whenever the server settings are missing, which is right for
 * Expo Go and wrong everywhere else. `productionEnvProblem` refuses to BUILD a production binary
 * without them — but an over-the-air update is JavaScript alone, bundled wherever `eas update`
 * was run, and one bundled without the production settings would arrive on a store build with no
 * server in it. The phone would then sign its parent into a backend that lives on the phone,
 * with the household's real entries still in the local database underneath.
 *
 * So the binary's own channel decides: a build made for a channel is a real build, and on one
 * the mock is an error, thrown before anything mounts — no sign-in, no sign-out, nothing wiped.
 * `ErrorScreen` says nothing was lost, and the next launch takes the corrected update, which
 * `expo-updates` fetches natively whether or not this JavaScript runs.
 *
 * @param channel the binary's update channel (`app/updates.ts`), null in Expo Go and dev builds
 * @returns what is wrong, or null when this environment may run
 */
export function releaseEnvProblem(channel: string | null, env: AppEnv): string | null {
  if (channel === null || env.authProvider === 'supabase') return null;
  return (
    `This build is on the "${channel}" update channel, but the JavaScript it is running has no ` +
    'server settings (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, ' +
    'EXPO_PUBLIC_AUTH_PROVIDER=supabase), so it would run on the test backend. It stopped instead.'
  );
}

/**
 * The production guard lives in `../env.guard.cjs` — plain CommonJS, because `app.config.ts`
 * runs under Expo's config loader, which cannot load a `.ts` import. It is re-exported here so
 * the rest of the app reads it from the same module as everything else about the environment.
 */
export { guardApplies, productionEnvProblem } from '../env.guard.cjs';

function fromProcess(): RawEnv {
  return {
    EXPO_PUBLIC_AUTH_PROVIDER: process.env.EXPO_PUBLIC_AUTH_PROVIDER,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
    EXPO_PUBLIC_COMMUNITY_ENABLED: process.env.EXPO_PUBLIC_COMMUNITY_ENABLED,
    EXPO_PUBLIC_OFF: process.env.EXPO_PUBLIC_OFF,
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED: process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED,
    EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED: process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED,
    EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED:
      process.env.EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED,
  };
}
