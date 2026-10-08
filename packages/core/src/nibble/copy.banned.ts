/**
 * THE PHRASES NIBBLECUE MAY NEVER SAY: a condition, a verdict on the baby, a diagnosis or a
 * promise. Data, not copy, so it lives in a `*.banned.ts` file the copy scanners skip (the
 * CuddleCue pattern, `schedule/foresight.banned.ts`).
 *
 * The line (bpnc-studio product-and-design.md, "Safety"): no sentence may describe a problem or a
 * state of the baby the app cannot see. "Peanut, 4 times, last offered Tuesday" is arithmetic.
 * "Allergic", "behind", "not eating enough", "normal" are claims about a child. Guidance says what
 * is COMMON ("gagging is common while learning"), never what is normal for this baby. A noticed
 * sign is a "possible reaction", never an allergy (spec §6.4). The owner allowed AI on
 * 2026-10-08; every sentence a model writes passes this list before it reaches a screen.
 */
export const NIBBLE_BANNED: readonly string[] = [
  'overtired',
  'not enough',
  'eating enough',
  'enough food',
  'too much food',
  'should be eating',
  'should be',
  'behind',
  'falling behind',
  'problem',
  'normal',
  'abnormal',
  'unhealthy',
  'allergic',
  'allergy to',
  'diagnos',
  'intolerant',
  'intolerance',
  'prevents allerg',
  'prevent allerg',
  'guarantee',
  'cure',
  'failure',
  'failing',
  'picky eater',
  'fussy eater',
  'bad eater',
  'underweight',
  'overweight',
  'calories',
  'dose',
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Each phrase matched from the start of a word, so "cure" finds "cure" and "cured" but not
 * "secure", and "diagnos" finds "diagnosis" and "diagnosed".
 */
const PATTERNS = NIBBLE_BANNED.map(b => [b, new RegExp(`\\b${escape(b)}`, 'i')] as const);

/** The banned phrases a sentence contains. Empty means the sentence may be shown. */
export function bannedIn(text: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([b]) => b);
}
