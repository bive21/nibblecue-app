/**
 * Two facts the growth prompts' rules need from the app, kept out of the hook so a node test can
 * read them without React Native (docs/GROWTH_PROMPTS.md §1, §2.2): when this person arrived, and
 * whether the card they just closed was a good moment.
 */
import type { AccountState } from '../auth/providers/types';

/**
 * WHEN THIS PERSON ARRIVED: the day they joined the household, or the day it began, whichever the
 * account carries. Until 2026-09-28 this was the oldest child's BIRTH date, which a comment called
 * a floor — and it was the opposite: a baby born two months before the sign-up made a day-old
 * account two months old, so the first-three-days rule and the review ask's three weeks never held
 * for anyone whose baby arrived before the app did. With neither date (a build or a cached account
 * from before they existed) the account reads as new this minute, which shows nothing.
 */
export function arrivedMs(account: Pick<AccountState, 'memberships' | 'serverNow'>): number {
  const m = account.memberships[0];
  for (const iso of [m?.joined_at, m?.household_created_at]) {
    const at = iso == null ? NaN : Date.parse(iso);
    if (Number.isFinite(at)) return at;
  }
  return account.serverNow;
}

/**
 * A CARD JUST READ AND CLOSED IS A GOOD MOMENT, on every plan. Until 2026-09-28 the free weekly
 * summary was its dates over a grid of dashes, and this held the rating ask back after one. The
 * week's numbers are free now (the owner: *"the numbers free, with 'compared with last week' as
 * Plus"*): a free household closes a card it could read in full, with only the comparison under it
 * locked, as every household closes a monthly note. So the moment is the card's, whatever its kind.
 */
export function celebrationEarned(c: {
  /** A card is still up (a twin's, after the first). The moment comes once none is. */
  open: boolean;
  /** A card was answered this session. */
  answered: boolean;
}): boolean {
  return !c.open && c.answered;
}
