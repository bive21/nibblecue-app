/**
 * WHICH GROWTH PROMPTS ARE LIT (docs/GROWTH_PROMPTS.md §1: every prompt ships dark until it is
 * switched on, and a bad week must be stoppable in a minute).
 *
 * THE RATING ASK IS ON (the owner, 2026-09-28: *"Do we want the occasional rate on playstore or app
 * store until user actually rates us? If so, add this"*). Everything else about it is unchanged:
 * the platform's own prompt and nothing else, asked only just after a moment the parent enjoyed,
 * never before 14 days, 20 entries and 7 days logged, at most twice a year, and never again after
 * two "Not now". "Until they rate" is the one part no app can do: neither store tells an app
 * whether a rating was left, so the caps above are what "occasional" means here.
 *
 * There is no admin console wired to the client yet, so the minute-long stop is an over-the-air
 * update that turns this back off (`pnpm update:publish`, docs/RELEASES.md §4).
 *
 * The cross-promotion card stays off, because there is no campaign, and the extra upgrade card has
 * no design yet (`GrowthCard` draws nothing for it).
 */
export const GROWTH_SWITCHES: Readonly<{ review: boolean; promo: boolean; upgrade: boolean }> = {
  review: true,
  promo: false,
  upgrade: false,
};
