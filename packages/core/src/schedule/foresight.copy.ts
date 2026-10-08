/**
 * WHAT A FORESIGHT NOTIFICATION SAYS.
 *
 * ── THE DECISION BEHIND THE WORDING (owner, 2026-09-18) ─────────────────────────────────────
 *
 * The owner asked for "your baby might be sleepy" and I pushed back on it against CLAUDE.md §2
 * rule 6, which says the household's own patterns are described and "never phrased as a
 * prediction". They overruled it, and their reasoning is recorded because it changes the
 * standing brief:
 *
 *   *"dont be too strict with the rules, unless it is breaking store rules. as long as it's not
 *   then we have to continue. these notificaions can help and i am going to be using this app
 *   personally and it would help me trememndously, not sure why it would harm me, even if it was
 *   not correct, but we are just giving analytical statements based on predictions."*
 *
 * They are right on the substance and I was wrong to fold two different rules together. Rule 3
 * forbids DIAGNOSING a problem — sleep, feeding, illness, growth — and "usually sleeps around
 * now" diagnoses nothing; it is the household's own median said out loud. Neither store's health
 * policy is engaged by it either: the App Store and Play target medical claims, and a timestamp
 * average is not one. Rule 6 was the owner's own line and the owner has moved it.
 *
 * ── WHAT IS STILL HELD, AND WHY IT IS NARROW ────────────────────────────────────────────────
 *
 * One line, and it is the line the rules were actually protecting: nothing here may describe a
 * PROBLEM or a STATE OF THE BABY the app cannot see. "Usually feeds around now" is arithmetic.
 * "Overtired", "not sleeping enough", "your supply is low", "should be feeding by now" are
 * claims about a baby's condition, and they are the ones that are both wrong-when-wrong and
 * store-risky. `BANNED` is that line, and `foresight.test.ts` enforces it.
 *
 * Every sentence also carries HOW MANY entries it came from, because a median of four gaps and a
 * median of forty are different degrees of the same claim and the parent is owed the difference.
 */

/*
  The phrases this file may never contain are kept next door, in `foresight.banned.ts`. A list of
  forbidden sentences cannot live among the sentences it governs: the folder scanner in
  `labels.test.ts` reads string literals, and it cannot tell a ban from a slogan. It is not
  re-exported from here or from any barrel (2026-09-27): only tests read it, and Metro ships every
  module a shipped one names, so its suites import it by path (`@nibblecue/core/schedule/
  foresight.banned` from the app's).
*/

const NOUN: Readonly<Record<string, string>> = {
  sleep: 'a sleep',
  bottle: 'a feed',
  breastfeed: 'a feed',
  pump: 'a pump',
  diaper: 'a change',
  bath: 'a bath',
  tummy: 'tummy time',
  med: 'a medicine',
  solids: 'solids',
};

/**
 * `3h 05m` — the gap in the words a parent uses for it.
 *
 * Named for this file rather than `gapLabel`, which already exists in the patterns copy for a
 * different shape of sentence; two exports of one name from `packages/core` is an ambiguity the
 * barrel refuses, and the right fix is two honest names rather than one re-export.
 */
/**
 * THE GAP AS A SENTENCE SAYS IT. An ordinary rhythm is "every 3h 05m". A gap longer than an
 * ordinary one — the whole night after the bedtime feed, or a work day's last pump to the next
 * morning's first — is not a rhythm anyone would describe with "every", so it is said as what it
 * is: "11h after the last one" (`foresight.ts` measures it from the same time of day).
 */
const EVERY_UP_TO_MS = 8 * 60 * 60_000;
const gapPhrase = (ms: number): string =>
  ms > EVERY_UP_TO_MS ? `${foresightGap(ms)} after the last one` : `every ${foresightGap(ms)}`;

export function foresightGap(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

const nounFor = (activity: string): string => NOUN[activity] ?? 'something';

/**
 * THE ACTIVITIES THAT ARE NOT THE BABY'S. A pump is the parent's, and "Ada usually has a pump
 * about now" is a sentence about the wrong person — the same mistake the schedule engine avoids
 * by scoping these rules to the household rather than to a child (`Rule.childId`). They take
 * "you" and the plural verb; everything else takes the baby's name.
 */
const HOUSEHOLD_ACTIVITIES: ReadonlySet<string> = new Set(['pump', 'hydration', 'selfcare']);
const mine = (activity: string): boolean => HOUSEHOLD_ACTIVITIES.has(activity);
const capitalized = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

/**
 * ONE ACTIVITY: the baby's name, the thing, and the household's own number.
 *
 * "Ada usually has a feed about now: every 3h 05m over the last 12" is a statement with its
 * working shown. It does not say the baby is hungry and it does not tell anyone to do anything;
 * a parent who reads it and decides to wait has not been contradicted by the app.
 */
export const oneLine = (baby: string, activity: string, gapMs: number, samples: number): string =>
  `${mine(activity) ? 'You usually have' : `${baby} usually has`} ${nounFor(activity)} about now: ${gapPhrase(gapMs)}${gapMs > EVERY_UP_TO_MS ? ',' : ''} over the last ${samples}.`;

/** The title a phone shows above it: short, and never an imperative. */
export const oneTitle = (baby: string, activity: string): string =>
  mine(activity)
    ? `${capitalized(nounFor(activity))}?`
    : `${capitalized(nounFor(activity))} for ${baby}?`;

/**
 * TWO OR MORE AT ONCE, in one notification (the owner: "then the notifications should be 2 in
 * one"). The title counts them so the parent knows before they open it that this is the busy
 * kind of moment, and the body names each with its own number — merging must not cost the
 * working, or the merged line would be vaguer than the two it replaced.
 */
export const manyTitle = (baby: string, activities: readonly string[]): string =>
  activities.some(mine)
    ? `${activities.length} things around now`
    : `${activities.length} things around now for ${baby}`;

export const manyLine = (
  baby: string,
  parts: readonly { activity: string; gapMs: number; samples: number }[],
): string => {
  const list = (ps: readonly { activity: string; gapMs: number }[]): string =>
    ps.map(p => `${nounFor(p.activity)} ${gapPhrase(p.gapMs)}`).join(' and ');
  const theirs = parts.filter(p => !mine(p.activity));
  const ours = parts.filter(p => mine(p.activity));
  const clauses: string[] = [];
  if (theirs.length > 0) clauses.push(`${baby} usually has ${list(theirs)}`);
  if (ours.length > 0)
    clauses.push(`${clauses.length > 0 ? 'you' : 'You'} usually have ${list(ours)}`);
  return `${clauses.join(', and ')}, over the last ${Math.min(...parts.map(p => p.samples))} of each.`;
};
