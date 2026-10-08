/**
 * ── WHAT WAS NOTICED, AS ONE ENTRY IN BOTH APPS ───────────────────────────────────────────────
 *
 * CuddleCue's Health note (its migration 0160, the owner's request of 2026-10-08) holds what a
 * parent noticed: chips for what was seen, the parent's own words, a start and an end. NibbleCue
 * writes its "Something you noticed" as that same entry, and keeps beside it, in a `noticed`
 * record, only what CuddleCue has no place for: the foods it followed, the onset, and its fuller
 * list of signs (`noteId` links the two). One entry, read by both apps and the pediatrician sheet.
 *
 * CuddleCue's chips are fewer than NibbleCue's signs. A sign with a chip of its own maps to it;
 * every other one is CuddleCue's "Other", and the parent's own words say the rest. Nothing is
 * renamed into a condition on the way.
 */
import type { Noticed, Sign } from './types';
import { dayOf, type DayOf, type IsoDay } from './days';

/** CuddleCue's `WellbeingSeen` tokens (its domain-types.ts). */
export type HealthSeen =
  'RASH' | 'SWELLING' | 'SPIT_UP' | 'LOOSE_DIAPER' | 'COUGH' | 'FUSSY' | 'OTHER';

export const SIGN_TO_SEEN: Readonly<Record<Sign, HealthSeen>> = {
  rash: 'RASH',
  hives: 'RASH',
  itchy_mouth: 'OTHER',
  vomiting: 'OTHER',
  diarrhea: 'LOOSE_DIAPER',
  mucus_stool: 'OTHER',
  swelling: 'SWELLING',
  breathing: 'OTHER',
  pale_floppy: 'OTHER',
  other: 'OTHER',
};

/** The Health note's chips for a set of signs: each once, in CuddleCue's order. */
export function seenFor(signs: readonly Sign[]): HealthSeen[] {
  const order: HealthSeen[] = [
    'RASH',
    'SWELLING',
    'SPIT_UP',
    'LOOSE_DIAPER',
    'COUGH',
    'FUSSY',
    'OTHER',
  ];
  const set = new Set(signs.map(s => SIGN_TO_SEEN[s]));
  return order.filter(s => set.has(s));
}

/** A CuddleCue Health note as the plan reads it: when it was. */
export interface HealthNote {
  id: string;
  childId: string | null;
  startAt: string;
}

/**
 * EVERY NOTE COUNTS FOR TIMING, ONLY A LINKED ONE FOR AN ALLERGEN. A Health note written in
 * CuddleCue, with no foods named, still pauses the next NEW allergen for fourteen days (spec §8.2
 * rule 13: "≥14 days after any logged reaction"); it never holds a food or an allergen, because
 * that would be the app deciding what caused it (CuddleCue's HEALTH_NOTES.md: "nothing ranked,
 * highlighted or linked"). A note NibbleCue wrote carries its foods in its own record.
 */
export function noticedForPlan(
  records: readonly Noticed[],
  notes: readonly HealthNote[],
): Noticed[] {
  const linked = new Set(records.map(r => r.noteId).filter((x): x is string => x !== null));
  const unlinked: Noticed[] = notes
    .filter(n => !linked.has(n.id))
    .map(n => ({
      at: n.startAt,
      activityId: null,
      noteId: n.id,
      foodIds: [],
      signs: ['other'],
      onsetMinutes: null,
      notes: null,
    }));
  return [...records, ...unlinked];
}

/** The day of the latest note, for display ("Plan paused for new allergens until …"). */
export function latestNoticedDay(
  noticed: readonly Noticed[],
  offsetMinutes: DayOf = 0,
): IsoDay | null {
  let last: IsoDay | null = null;
  for (const n of noticed) {
    const d = dayOf(Date.parse(n.at), offsetMinutes);
    if (last === null || d > last) last = d;
  }
  return last;
}
