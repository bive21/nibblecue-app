/**
 * WHICH SOCIAL SIGN-IN BUTTONS AUTH DRAWS, AND WHERE (the launch review and the owner, 2026-09-27:
 * "add google", then "remove apple sign in"; restored 2026-10-02 so Google can stand beside Apple
 * on an iPhone under App Store guideline 4.8).
 *
 * Three rules, and each has a reason outside this app:
 *
 *   1. A BUTTON ONLY FOR A SIGN-IN THIS BUILD CAN FINISH. The provider says which it can
 *      (`AuthProvider.socialSignIn`): the in-app test backend both, the Supabase provider each
 *      once the owner has switched it on. A button that can only answer "not set up yet" is a
 *      control that does not work, and App Review rejects those (2.1).
 *   2. ON AN IPHONE, NO GOOGLE WITHOUT APPLE. App Store guideline 4.8: an app that offers a
 *      third-party login must offer Sign in with Apple beside it.
 *   3. APPLE WHERE APPLE IS THE PHONE (the owner, 2026-09-26). On an iPhone it sits on the panel,
 *      first; on Android nobody expects it when creating an account, so it is a quiet "Sign in with
 *      Apple" on the sign-in side only, for an account made with Apple on an iPhone — and only
 *      when the provider can finish that path (Services ID; docs/LAUNCH_GUIDE.md Step 5.8).
 *
 * Pure, so the rules are tested in node per platform and per switch (`socialSignIn.test.ts`).
 */
import type { SocialMethod } from './providers/types';

export interface SocialButtons {
  /** "Continue with Apple" on the panel, above Google. iPhone only. */
  applePanel: boolean;
  /** The quiet "Sign in with Apple" under "Forgot password?", on the sign-in side. Android only. */
  appleSignInSide: boolean;
  /** "Continue with Google" on the panel. */
  google: boolean;
  /** Whether the panel has any social button, and so the "or" rule above the email fields. */
  anyOnPanel: boolean;
}

/**
 * @param platform `Platform.OS`, read by the caller so this stays free of React Native
 * @param available what the provider can finish (`AuthProvider.socialSignIn`)
 */
export function socialButtons(
  platform: string,
  available: ReadonlySet<SocialMethod>,
): SocialButtons {
  const ios = platform === 'ios';
  const apple = available.has('apple');
  // guideline 4.8: on an iPhone, Google only ever stands beside Apple
  const google = available.has('google') && (!ios || apple);
  const applePanel = ios && apple;
  return {
    applePanel,
    appleSignInSide: !ios && apple,
    google,
    anyOnPanel: applePanel || google,
  };
}

/** Owner switches → which methods this phone's build may finish (before AUTH draws buttons). */
export function socialMethodsOf(
  social: { google: boolean; apple: boolean; appleAndroid: boolean },
  platform: string,
): ReadonlySet<SocialMethod> {
  const out = new Set<SocialMethod>();
  if (social.google) out.add('google');
  if (platform === 'ios' && social.apple) out.add('apple');
  if (platform === 'android' && social.appleAndroid) out.add('apple');
  return out;
}
