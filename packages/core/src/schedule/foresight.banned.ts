/**
 * THE PHRASES A FORESIGHT LINE MAY NEVER SAY — a condition, a judgement, or an instruction.
 *
 * IT LIVES IN ITS OWN FILE BECAUSE IT IS DATA, NOT COPY. `labels.test.ts` reads every string
 * literal in this folder and fails the build on a judgement phrase, which is exactly right for a
 * file of sentences a parent will read — and exactly wrong for the list of sentences we refuse to
 * write. Held in `foresight.copy.ts` the ban on "should be" tripped the scanner that enforces it,
 * so the two are separated: `*.banned.ts` is the only shape the scanner skips, and the skip is
 * narrow enough that nothing can hide product copy behind it.
 *
 * The line itself is the one CLAUDE.md §2 was actually protecting (the owner narrowed rule 6 on
 * 2026-09-18 — `foresight.copy.ts` records the decision): nothing may describe a PROBLEM or a
 * STATE OF THE BABY the app cannot see. "Usually feeds around now" is arithmetic. "Overtired",
 * "your supply is low", "should be feeding by now" are claims about a baby's condition.
 */
export const BANNED: readonly string[] = [
  'overtired',
  'too long',
  'too short',
  'not enough',
  'should be',
  'you should',
  'need to',
  'low supply',
  'behind',
  'falling behind',
  'problem',
  'normal',
  'abnormal',
  'healthy',
  'unhealthy',
  'recommend',
];
