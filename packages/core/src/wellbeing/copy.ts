/**
 * THE HEALTH NOTE'S WORDS (the owner, 2026-10-08), in one place, and the scan test beside them
 * (`wellbeing.scan.test.ts`) holds every one of them to `wellbeing.banned.ts`.
 *
 * WHAT A HEALTH NOTE IS. Something a parent noticed, written down in their own words, with a few
 * chips for what they SAW and when it started. The app keeps the record and lays out what else was
 * logged before it; a parent asked for exactly that ("so that it can be looked back what happened
 * before that"), and the pediatrician sheet carries both so a clinician can read them.
 *
 * WHAT IT IS NOT, and every word below is chosen for it (CLAUDE.md §2, rules 1 to 3 and 6). The
 * chips name what a parent can see, never a condition: "Rash", never the word for what a rash
 * might mean. The look back is a list of the household's own entries in the order they happened,
 * with nothing ranked, highlighted, linked to the note or said to explain it. The one fact it adds
 * is arithmetic over the log: a food whose first logged meal falls in the window is marked "first
 * time logged", which is a date, not a suspicion.
 *
 * THE NAME LIVES IN ONE PLACE: the registry's `label` for `wellbeing`. If a reviewer objects to
 * "Health note", the fallback is "Wellbeing note", and that is a one-line change there (plus the
 * generated registry migration, docs/HEALTH_NOTES.md §6); every word here is built from it.
 */
import type { WellbeingSeen } from '../domain/domain-types';
import { WellbeingSeen as SeenKinds } from '../domain/domain-types';
import { MODULE_BY_ID } from '../modules/module-registry';

/** The chips, in the order the sheet draws them. `Other` is last: the words carry the rest. */
export const WELLBEING_SEEN: readonly WellbeingSeen[] = SeenKinds.options;

/** Each chip's word. What was seen, never a condition. */
export const SEEN_LABEL: Readonly<Record<WellbeingSeen, string>> = {
  RASH: 'Rash',
  SWELLING: 'Swelling',
  SPIT_UP: 'Spit up',
  LOOSE_DIAPER: 'Loose diaper',
  COUGH: 'Cough',
  FUSSY: 'Fussy',
  OTHER: 'Other',
};

/** The name, from the registry: "Health note". */
export const NOTE_NAME: string = MODULE_BY_ID.wellbeing.label;
/** "health note", for the middle of a sentence. */
export const NOTE_NAME_LOWER: string = NOTE_NAME.toLowerCase();
/** "Health notes", a section's title. */
export const NOTES_TITLE = `${NOTE_NAME}s`;

/**
 * THE + MENU'S LINE FOR IT (the owner's brief): read under the sheet's title and spoken with the
 * tile, because a bubble tile has room for its name and nothing more.
 */
export const NOTE_SUBTITLE = 'Something you noticed, in your own words';

/** `Rash, spit up` — the chips as tapped, the first word capitalized and the rest as words. */
export function seenText(seen: readonly WellbeingSeen[]): string {
  const words = seen.map((s, i) => (i === 0 ? SEEN_LABEL[s] : SEEN_LABEL[s].toLowerCase()));
  return words.join(', ');
}

/**
 * The chips as stored, read back: an array, or the mirror's JSON array text (WP4 D31). Unknown
 * tokens are dropped rather than shown as codes (an enum value is never copy, DESIGN_SYSTEM §21),
 * repeats are dropped, and the order is the sheet's, whatever order they were tapped in.
 */
export function seenOf(raw: unknown): WellbeingSeen[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const have = new Set(list.filter((v): v is string => typeof v === 'string'));
  return WELLBEING_SEEN.filter(s => have.has(s));
}

/**
 * The one line a Health note is read by in a list — the Log's row, the look back, the sheet: the
 * chips, then the parent's own words, verbatim. Either may be missing; never both, because the
 * sheet will not save an empty note (`noteProblem`).
 */
export function noteLine(seen: readonly WellbeingSeen[], words: string | null | undefined): string {
  const said = (words ?? '').trim();
  const chips = seenText(seen);
  if (chips === '') return said;
  return said === '' ? chips : `${chips} · ${said}`;
}

/** Why the sheet cannot save as it stands, or null: a note needs a chip or some words. */
export const NOTE_EMPTY = 'Tap what you noticed, or write it in your own words';
export function noteProblem(seen: readonly WellbeingSeen[], words: string): string | null {
  return seen.length === 0 && words.trim() === '' ? NOTE_EMPTY : null;
}

/* ── the sheet ───────────────────────────────────────────────────────────────────────────── */

export const NOTE_COPY = {
  /** The chips' heading. */
  seen: 'What you noticed',
  /** The words' field. */
  words: 'In your own words',
  wordsHint: 'What you saw, where, and anything else you want to remember',
  /** The time row's eyebrow, and the row under it that moves the day. */
  started: 'Started at',
  startedOn: 'Day it started',
  /** Whether it is still going, and when it stopped. */
  stillGoing: 'Still going',
  stopped: 'It stopped',
  goingLabel: 'Is it still going?',
  stoppedOn: 'Day it stopped',
  stoppedAt: 'Stopped at',
  save: `Save ${NOTE_NAME_LOWER}`,
  /** The door to the look back, on the sheet. */
  lookBack: 'Logged before this',
  lookBackHint: 'Everything logged for this baby in the hours before it started',
} as const;

/** `Saved: health note at 10:02 AM`, in the words every save toast uses. */
export const savedNote = (clock: string): string => `Saved: ${NOTE_NAME_LOWER} at ${clock}`;

/* ── the look back ───────────────────────────────────────────────────────────────────────── */

export const LOOK_BACK_COPY = {
  title: 'Logged before this',
  /** The segmented choice's spoken label, and each option's word. */
  window: 'How far back',
  hours: (h: number): string => `${h} h`,
  /** The count over the list: what it is, in numbers. */
  count: (n: number, hours: number): string =>
    n === 0
      ? `Nothing logged in the ${hours} hours before it started`
      : `${n} ${n === 1 ? 'entry' : 'entries'} in the ${hours} hours before it started`,
  /** Under the list, the sheet's own honesty about what a log is. */
  caveat:
    'This is what was logged, in the order it happened. Gaps mean nothing was logged, which is not the same as nothing happening.',
  /** The one fact the look back adds: a food's first logged meal falls in the window. */
  firstTime: 'first time logged',
  /** When the window reaches past what this plan shows (the Log's own floor). */
  clipped:
    'Earlier entries are kept. Your whole log is part of Plus, and your full download has every entry, on every plan.',
  /** The buttons at its foot. */
  done: 'Done',
  change: 'Change this note',
  /** The note itself, at the top. */
  noted: (stamp: string): string => `Started ${stamp}`,
  ended: (stamp: string): string => `Stopped ${stamp}`,
  noEnd: 'No end logged',
} as const;

/* ── the pediatrician sheet ─────────────────────────────────────────────────────────────── */

export const VISIT_NOTE_COPY = {
  title: NOTES_TITLE,
  empty: `No ${NOTE_NAME_LOWER}s in this period.`,
  /** A note's end, or that none was logged — never "still going", which the sheet cannot know. */
  until: (stamp: string): string => `until ${stamp}`,
  noEnd: 'no end logged',
  /** The parent's words, verbatim, under the chips. */
  words: 'As written',
  /** The look back's heading under each note: a fixed 48 hours on the sheet. */
  before: (hours: number): string => `Logged in the ${hours} hours before`,
  nothingBefore: 'Nothing logged',
  since: (stamp: string): string => `since ${stamp}`,
  sleep: 'Sleep',
  feeds: 'Feeds',
  solids: (stamp: string): string => `Solids · ${stamp}`,
  diapers: 'Diapers',
  temperature: (stamp: string): string => `Temperature · ${stamp}`,
  medicine: (stamp: string): string => `Medicine · ${stamp}`,
  other: 'Also logged',
  note: (stamp: string): string => `${NOTE_NAME} · ${stamp}`,
  more: 'More notes',
  moreNote: 'each one is in the log, and in the full download',
  firstTime: 'first time logged',
} as const;
