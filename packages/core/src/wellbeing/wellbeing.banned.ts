/**
 * THE WORDS A HEALTH NOTE'S COPY MAY NEVER SAY (the owner's brief of 2026-10-08, CLAUDE.md §2 rules
 * 1 to 3 and 6): a diagnosis, a condition, a cause, a likelihood or an alarm. A Health note is a
 * parent's record of what they saw; the look back is their own entries in the order they happened;
 * the sheet hands both to the person qualified to read them. Not one word here may move a judgment
 * into the app — "may be the cause", "likely", "a reaction to" — whether it names the baby, a food
 * or a medicine.
 *
 * DATA, NOT COPY, which is why it has a file of its own (the reason `foresight.banned.ts` gives):
 * `wellbeing.scan.test.ts` reads every string in the Health note's copy, its look back and its
 * section of the pediatrician sheet, and a list of the words it refuses would trip it.
 *
 * Each is a pattern, matched without regard to case, so a word is caught in its forms ("caused",
 * "causes") and a phrase where it is a phrase ("due to"). `cause` is matched as a word's START so
 * that "because" stays a plain English word.
 */
export const WELLBEING_BANNED: readonly RegExp[] = [
  /diagnos/i,
  /\bcondition/i,
  /symptom/i,
  /allerg/i,
  /reaction/i,
  /\bcause/i,
  /\bcaused\b/i,
  /\bdue to\b/i,
  /likely/i,
  /\bmay be\b/i,
  /\bmight be\b/i,
  /warning/i,
  /concerning/i,
  /\bnormal/i,
  /abnormal/i,
];
