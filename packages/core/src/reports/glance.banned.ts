/**
 * THE WORDS A COMPARISON ON REPORTS MAY NEVER USE — a verdict on a number, said about a baby.
 *
 * IT LIVES IN ITS OWN FILE BECAUSE IT IS DATA, NOT COPY, for the reason `schedule/foresight.banned.ts`
 * gives: a list of words we refuse to write cannot sit among the sentences it governs, where a
 * scanner reading string literals would take the ban for a slogan.
 *
 * "2 more than yesterday" is arithmetic. "2 more than yesterday — better!" is a verdict, and so is
 * "only 3 feeds", "a good night", "sleeping longer", "back to normal", "enough diapers" or "should
 * be up by now". The owner asked for comparisons in words (2026-09-26) and the rule under them has
 * not moved: the app says how two stretches of the household's own log differ, and never whether
 * that is good, bad, enough, expected or improving (CLAUDE.md §2 rules 1, 3 and 6). More is not
 * better, fewer is not worse, and the words are the same either way round.
 *
 * `glanceVerdictHits` (below) checks a sentence against THIS list, against `REPORT_BANNED` (every
 * report sentence's own list — amounts, advice, the clinical frame) and against `BANNED` (the
 * foresight list — a baby's condition). Three lists, one call.
 *
 * TEST SUPPORT, NOT SHIPPED (2026-09-27). Only suites read this file, so nothing the app imports
 * names it: the check lived in `glance.copy.ts` until then, and took this list and the foresight
 * one into every build with it. Its suites import it by path (`@nibblecue/core/reports/
 * glance.banned` from the app's); `test-support.test.ts` keeps it out of the barrel.
 */
import { BANNED } from '../schedule/foresight.banned';
import { bannedHitsIn, reportBannedHits } from './observations';

export const GLANCE_VERDICTS: readonly string[] = [
  // a grade
  'better',
  'worse',
  'best',
  'worst',
  'good',
  'great',
  'bad',
  'nice',
  'fine',
  'okay',
  'well',
  'poorly',
  // a norm
  'normal',
  'typical',
  'expected',
  'usual for',
  'average baby',
  'healthy',
  // a verdict on an amount
  'enough',
  'only',
  'just',
  'too',
  'plenty',
  // a direction with a value on it
  'improve',
  'improved',
  'improving',
  'improvement',
  'making progress',
  'longer',
  'shorter',
  'higher',
  'lower',
  'rising',
  'falling',
  'trend',
  'on track',
  // advice and alarm
  'should',
  'worry',
  'worrying',
  'alarm',
];

/**
 * EVERY WORD A COMPARISON MUST NOT USE, from three lists in one call: `REPORT_BANNED` (a report's
 * own — a verdict on an amount, advice, the clinical frame), `BANNED` (the foresight list — a
 * baby's condition, matched as a phrase anywhere in the line) and `GLANCE_VERDICTS` (a grade, a
 * norm, a direction with a value on it). An empty array is a sentence that only says how much.
 */
export function glanceVerdictHits(text: string): string[] {
  const lower = text.toLowerCase();
  return [
    ...new Set([
      ...reportBannedHits(text),
      ...BANNED.filter(phrase => lower.includes(phrase)),
      ...bannedHitsIn(text, GLANCE_VERDICTS, []),
    ]),
  ];
}
