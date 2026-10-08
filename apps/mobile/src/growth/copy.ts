/**
 * The growth prompts' words (docs/GROWTH_PROMPTS.md §2.3, §3.3).
 *
 * FIXED TEXT, IN THE STRING CATALOGUE, and that is a rule rather than a convenience: the admin
 * console can turn a prompt on or off and set its cadence, and cannot write its copy. A
 * free-text growth card is a phishing surface and a store-policy risk — whatever is typed into
 * a campaign field would render inside the app, over the household's own data, wearing the
 * app's own chrome.
 *
 * THE RATING ASK HAS NO WORDS OF ITS OWN (§2.3, since 2026-09-28). It is the platform's prompt,
 * asked straight after a good moment, because both stores forbid a question before it and a button
 * that calls it; the card that said *Glad it's helping?* is gone. What is left here is More's
 * footer link, which opens the store listing: the one way to rate that is a button, and the one
 * both stores name as the alternative. It says what it does and nothing else: no stars, no five,
 * no please. Tell a friend, beside it, sends one download link. The other person's phone opens
 * the store that phone uses.
 *
 * The product name comes from `@nibblecue/brand` at the call site; `brand.test.ts` scans every
 * tracked file and it may not be typed here.
 */
export const GROWTH_COPY = {
  rate: {
    /** Under the wordmark. The app's name is already on that line, so the link does not repeat it. */
    link: 'Rate us',
    /** Where the link goes, said to a screen reader, so the jump out of the app is never a surprise. */
    whereAndroid: 'On Google Play',
    whereIos: 'On the App Store',
    /** Said when the store would not open, rather than a tap that does nothing. */
    failed: 'The store did not open. Try again in a moment.',
  },
  /**
   * Beside Rate us. "Share" is the shopping list and "Invite" is a household, so this says who
   * it is for. `app` and `line` are brand values passed in. `url` is the one download page.
   */
  share: {
    link: 'Tell a friend',
    message: (app: string, line: string, url: string): string =>
      `${app}. ${line} Get it here: ${url}`,
  },
  promo: {
    /**
     * Labelled, so it is obviously the maker and not an ad (§3.1). The studio's name is a BRAND
     * VALUE and is read from `@nibblecue/brand` at the call site — `placement.test.ts` scans
     * every app file for it, and a card that typed it here would fail the build.
     */
    from: (developer: string): string => `From ${developer}`,
    dismiss: 'No thanks',
    /** The button's words depend on the platform, because the store does. */
    seeIos: 'See it on the App Store',
    seeAndroid: 'See it on Google Play',
  },
} as const;
