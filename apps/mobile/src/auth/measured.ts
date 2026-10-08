/**
 * NOTHING IS MEASURED ON THE SIGN-IN SCREENS (CLAUDE.md §7: product analytics is "never on the
 * auth screens"; Privacy §2: any counts will never "measure the sign-in screens"). The sink is a
 * no-op today (`AuthContext`), and these rules are what it will obey the day it is wired:
 *
 *   - `analyticsOpen` — the gate on the app's one emitter. Shut while the phase is one of the
 *     sign-in screens (booting, AUTH, Verify) or while AUTH is showing the terms step.
 *   - `launchCounted` — `app_open` counts a launch that LANDED past them: in the household, or in
 *     its setup. A launch that stays on AUTH, Verify or Ended counts nothing.
 *   - `signOutMeasured` — `signed_out` describes a sign-out made from inside the household, and is
 *     decided when the teardown STARTS: the event itself is written at the teardown's last step,
 *     once the app is already back on AUTH, so the gate could not decide it then. A sign-out from
 *     Verify, from Ended or from the terms step is not measured.
 *
 * The sign-up count moved with them: `signup_completed` is emitted by setup's first page for a new
 * account (`screens/onboarding/OnboardingScreen.tsx`), and `signup_started` is gone — it could
 * only ever be measured on AUTH. `screens/auth/noAnalytics.scan.test.ts` holds all of it.
 */

/** `AuthContext`'s `Phase`, restated so this file stays importable in node. */
export type PhaseName = 'booting' | 'signed_out' | 'unverified' | 'onboarding' | 'ended' | 'ready';

/** Whether the app's emitter may send anything right now. */
export function analyticsOpen(phase: PhaseName, termsStepShown: boolean): boolean {
  if (termsStepShown) return false;
  return phase === 'onboarding' || phase === 'ready' || phase === 'ended';
}

/** Whether this launch has landed where `app_open` counts it. */
export function launchCounted(phase: PhaseName, termsStepShown: boolean): boolean {
  return !termsStepShown && (phase === 'onboarding' || phase === 'ready');
}

/** Whether a sign-out starting now is one to measure. */
export function signOutMeasured(phase: PhaseName, termsStepShown: boolean): boolean {
  return !termsStepShown && phase === 'ready';
}
