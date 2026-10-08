/**
 * THE SAMPLE THE SHOPPING CARD OFFERS A HOUSEHOLD WITH NOTHING TO ADD (the owner, 2026-09-25:
 * *"Step 6, before user shares, they first need to add the supplies to the shopping cart. If user
 * does not have anything filled, then we use trial entry (let them know)"*).
 *
 * The card asks for something to be put on the list before the list is sent. A household whose
 * catalog is empty — setup's supplies step can be passed through — has nothing in Add supplies to
 * put there, and the Supplies page it lands on instead asks for a whole new item to be typed in.
 * So the tour puts ONE sample in the catalog as the card arrives, the card says so (`prefilled`),
 * and the sample goes again with every other trial entry when the tour ends
 * (`apps/mobile/src/tour/tourWrites.ts`, which takes it back by id and only while it is still the
 * sample — one the parent renamed has become theirs).
 *
 * IT REPLACED THE TRIAL LIST of 2026-09-24 (the owner then: *"it does not make sense for user to be
 * ask to share, when supply list is empty"*): up to three lines put straight on an empty list, so
 * that Share had something to send. With the parent putting the line there themselves, the list
 * is never empty when Share is asked for, and a list the tour had already filled would leave the
 * parent nothing to add.
 *
 * DIAPERS, AND NAMED FOR WHAT IT IS. Every baby's household buys diapers, so the sample reads as a
 * plausible line and never as a suggestion — nothing a baby is fed and nothing from a medicine
 * shelf, because a thing the app made up must not read as advice about how to feed or treat a baby
 * (CLAUDE.md §2). And it is called "Sample item", the words the card uses, so the parent can find
 * the thing the card is talking about. A sample called "Diapers" would read "Diapers: Diapers" on
 * the list, where this reads "Diapers: Sample item" (`lineTitle`).
 */
import type { SupplyFields } from '../sync/chains';

/** The sample, as the catalog stores it. */
export const TRIAL_SUPPLY: Readonly<SupplyFields> = {
  category: 'DIAPERS',
  brand: null,
  product: 'Sample item',
  variant: null,
  pack: null,
  store: null,
  notes: null,
  url: null,
};

/**
 * Whether this catalog gets the sample: only when there is nothing in it at all, which is the
 * household the owner described. One with a catalog puts one of its own things on the list.
 */
export function needsTrialSupply(catalog: readonly unknown[]): boolean {
  return catalog.length === 0;
}

const sameText = (a: string | null, b: string | null): boolean =>
  (a ?? '').trim() === (b ?? '').trim();

/**
 * WHETHER A CATALOG ROW IS STILL THE TOUR'S SAMPLE as the tour put it up, and so the tour's to take
 * back. A sample the parent renamed or moved to another shelf has become a thing this household
 * buys, and stays — the clean-up is wrong in the direction of keeping, which is the rule
 * `tourWrites.ts` is built on. A date bought is not a rename: a trip finished during the tour still
 * leaves a sample.
 */
export function isTrialSupply(row: Pick<SupplyFields, 'category' | 'brand' | 'product'>): boolean {
  return (
    row.category === TRIAL_SUPPLY.category &&
    sameText(row.brand, TRIAL_SUPPLY.brand) &&
    sameText(row.product, TRIAL_SUPPLY.product)
  );
}

/**
 * ── AND SOMETHING ON THE LIST TO SEND ───────────────────────────────────────────────────────────
 *
 * The owner, 2026-09-28: *"same thing with add supplies if there isnt anything listed. Make sure
 * you have trial items in case if user didnt fill it in, so they can share it if they want to."*
 *
 * The sample above gives Add supplies something to put on the list. It gave Share nothing: a
 * parent who put nothing on the list, having nothing they wanted on it, or only looking, had an
 * empty list and a card that would not take a Share. So a list with nothing still to buy gets two
 * sample lines as the shopping card arrives, one-offs like the ones typed under the list, and Share
 * answers the card whenever the list has something on it (`deedReady`'s `listed`). A list with
 * something to buy on it already is the household's own, and the tour puts nothing on it: a Share
 * from the tour sends what the household wrote.
 *
 * TWO, AND NAMED AS SAMPLES. One line on its own reads like a list with one thing to get; two read
 * as a list, which is what Share sends. "Sample" first, so a line the parent sends from the tour
 * says what it is to whoever reads it; wipes and bibs because every baby's household buys both,
 * and neither is a thing a baby is fed or treated with (CLAUDE.md §2), the rule the sample supply
 * keeps. Taken back by id when the tour ends, as every trial line on the list is
 * (`apps/mobile/src/tour/tourWrites.ts`).
 */
export const TRIAL_LINES: readonly string[] = ['Sample wipes', 'Sample bibs'];

/**
 * Whether this list gets the sample lines: only when nothing on it is still to buy. Share sends what
 * is still to buy (`shoppingText`), so a list of ticked lines is as empty to it as a list of none.
 * A list with an open line is the household's own and gets nothing.
 */
export function needsTrialLines(lines: readonly { checked_at: string | null }[]): boolean {
  return !lines.some(l => l.checked_at === null);
}
