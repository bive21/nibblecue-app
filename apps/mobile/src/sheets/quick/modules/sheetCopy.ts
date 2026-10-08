/**
 * Words the quick sheets gained on 2026-09-24, from the module audits — kept beside the sheets
 * that say them and scanned by `sheetCopy.test.ts` with the same lists every logging sheet's copy
 * passes (`BANNED_CLINICAL`, the care lists, the foresight list). Sentence case, US English, and
 * nothing that interprets a number, advises a dose or judges a baby.
 */

/** The bottle sheet's stash row, where it has to say which milk a save will actually take. */
export const BOTTLE_STASH_ROW = {
  /**
   * Plus, with nothing suggested (every container past its window, or under the smallest pour):
   * the draw takes only what is suggested, so naming the oldest container here — as the row did —
   * promised milk the save would not take (the audit of 2026-09-24, feeding H4).
   */
  noneSuggested: 'Nothing suggested right now. Choose one below.',
  /** Save is held until the parent picks a container or turns the stash off. */
  chooseFirst: 'Choose a container, or turn off Use from stash',
  /**
   * A container picked on the stash screen, with the bottle sheet on Both: a container feeds one
   * baby, so it cannot be used — said, where it used to be ignored in silence.
   */
  pickOneBaby:
    'A container feeds one baby. Pick one to use it. Saved for both, it stays in the stash.',
} as const;

/**
 * The captions over each twin's own bottle and what was left in it, so no stepper on the sheet
 * can be read as another baby's — or as the other of the two numbers (the owner, 2026-09-25).
 */
export const bottleOf = (name: string): string =>
  name === '' ? 'In the bottle' : `${name}’s bottle`;
export const leftIn = (name: string): string =>
  name === '' ? 'Left in the bottle' : `Left in ${name}’s bottle`;
/**
 * `1 oz stays in Freezer` — what a bottle from the stash leaves in its container (`stashStays`).
 * The place by its own name, the way every stash line names one ("Moved to Freezer", "Added 5 oz to
 * Fridge"): a household's places are names it chose, and "the Mom's freezer" would not read.
 */
export const stashStaysLine = (amount: string, place: string | null): string =>
  place ? `${amount} stays in ${place}` : `${amount} stays in the container`;
/** The growth sheet's one refusal: a scale reads more than nothing. */
export const GROWTH_WEIGHT_ZERO = 'Weight has to be more than 0';
