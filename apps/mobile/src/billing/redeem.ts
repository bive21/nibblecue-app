/**
 * A CODE, AS SOMEONE TYPED OR PASTED IT (docs/PROMO_CODES.md).
 *
 * The code is the store's — an App Store offer code or a Google Play promo code — so the app does
 * two things to one and no more: it takes out the spaces a paste brings with it, and it declines
 * to send the store something that cannot be a code (an empty field, a pasted sentence). Whether
 * a code is REAL, what it gives and whether it has been used are the store's answers, never these
 * functions': a check of our own that unlocked anything would be App Review guideline 3.1.1's
 * "own mechanism to unlock content or functionality".
 */

/** Longer than any code either store issues, short enough that a pasted paragraph is refused. */
const CODE_MAX = 64;

/** The code without the spaces and line breaks a paste from an email carries. */
export const tidyCode = (raw: string): string => raw.replace(/\s+/g, '');

/** Worth sending to the store: letters, digits and hyphens, four to sixty-four of them. */
export function codeReady(raw: string): boolean {
  const code = tidyCode(raw);
  return code.length >= 4 && code.length <= CODE_MAX && /^[A-Za-z0-9-]+$/.test(code);
}

/**
 * GOOGLE PLAY'S OWN LINK FOR A PROMO CODE, in the format its documentation gives
 * (developer.android.com/google/play/billing/promo, "Use the following format for a promo code
 * URL"). It opens the Play Store with the code already in the field. The store adapter opens it
 * on Android, and it is the link the email carries (docs/PROMO_CODES.md §3). Apple has no
 * equivalent to build: App Store Connect gives each offer its own link to add the code to.
 */
export const playRedeemUrl = (raw: string): string =>
  `https://play.google.com/redeem?code=${encodeURIComponent(tidyCode(raw))}`;
