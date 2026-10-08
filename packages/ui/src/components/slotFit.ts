/**
 * THE SUM BEHIND `SlotRow`'s LONG WORDS, pure so a node test can make it in the faces the app ships
 * (`SlotRow.tsx` has the why). No React Native here.
 */
/** The edge every slot carries, in every state (`SlotRow`'s `EDGE`). */
export const SLOT_EDGE = 1;
/**
 * The CLEAR SPACE a long word needs beyond its own width before it is drawn (4 points either side,
 * on top of the slot's own air): a word that only just fits reads as crammed, and a short one wins.
 */
export const LONG_CLEAR = 8;

/**
 * WHETHER EVERY LONG WORD HOLDS ITS SLOT (`SlotRow.tsx`'s header), from the row's measured width and each
 * word's measured width. `null` widths are not measured yet: the long words are kept until they
 * are (the likelier answer, so the first frame does not jump). `perLine` is how many slots share a
 * line: all of them, or two past `SLOT_WRAP_SCALE`.
 */
export function slotWordsFit({
  rowWidth,
  perLine,
  gap,
  air,
  wordWidths,
}: {
  rowWidth: number | null;
  perLine: number;
  gap: number;
  air: number;
  wordWidths: readonly (number | null)[];
}): boolean {
  if (rowWidth === null || wordWidths.some(w => w === null)) return true;
  const slot = (rowWidth - (perLine - 1) * gap) / perLine;
  const room = slot - 2 * SLOT_EDGE - 2 * air - LONG_CLEAR;
  return wordWidths.every(w => (w ?? 0) <= room);
}
