/**
 * WHAT THE COACH SAYS — now a line under a Routine row rather than a card on a page of its own
 * (`coach.ts` says where each one is drawn).
 *
 * Every sentence in this file has the same shape and it is not decoration: **a setting, a
 * measurement of the household's own log with its sample size, and a change to the setting.**
 * Nothing here has a baby as its subject. "Set to every 3h. Your own entries have been every
 * 2h 35m, over the last 41." is a statement about a field in a settings screen; the moment one of
 * these lines acquires a verb about a child it has become the thing CLAUDE.md §2 rule 2 and §7
 * forbid, whatever else it says.
 *
 * THE SETTING STAYS IN THE LINE even though the row above it already prints it. The row's own
 * sentence is a whole rhythm ("Every 3 h by day, every 5 h at night"); the line names the one
 * part of it this card is about, which is what lets a parent check the claim against the row, and
 * a feeding row with three set times needs it to say which of the three.
 *
 * Held by `coach.test.ts` against `BANNED` (shared with the foresight copy) and against a second
 * list of its own: no word here may say a number is big, small, good, bad, rising or falling. A
 * comparison between the app and the log is the only comparison this module makes.
 */
import { COACH_UNUSED_DAYS, type Suggestion } from './coach';

/** The eyebrow over every card: where the line came from, before what it says. */
export const COACH_TITLE = 'From your log';
/** The two rows under it (2026-10-03): the setting, then the log, each on its own line. */
export const COACH_NOW = 'Now';
export const COACH_LOG = 'Your log';

/** `3h 05m` · `45m` — the shape every duration in this app takes. */
export function coachGap(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}

const NOUN: Readonly<Record<string, string>> = {
  bottle: 'Feeding',
  breastfeed: 'Feeding',
  pump: 'Pumping',
  sleep: 'Sleep',
  diaper: 'Diapers',
  bath: 'Bath',
  tummy: 'Tummy time',
  med: 'Medicines',
  solids: 'Solids',
  growth: 'Growth',
  vaccine: 'Vaccines',
  stash: 'Milk stash',
};
const coachNoun = (activity: string): string => NOUN[activity] ?? activity;

const minutesToHhmm = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** `9:30 AM` · `9:30 AM and 1:00 PM` · `9:00 AM, 12:30 PM and 3:30 PM`. */
const clockList = (clocks: readonly string[]): string =>
  clocks.length <= 1
    ? (clocks[0] ?? '')
    : `${clocks.slice(0, -1).join(', ')} and ${clocks[clocks.length - 1] ?? ''}`;

/**
 * THE TWO ROWS UNDER THE ROUTINE ROW (2026-10-03). The setting, then the median with its count,
 * each short enough to sit on its own line. `when` is which wash the card takes: a night card is
 * the night wash, everything else the morning wash. Nothing here has a baby as its subject.
 *
 * `name` titles a clock time that has one of its own — the bed time, drawn under the Day card.
 */
export interface CoachPair {
  now: string;
  fromLog: string;
  when: 'day' | 'night';
}

export function coachPair(
  s: Suggestion,
  clock: (hhmm: string) => string,
  opts: { name?: string } = {},
): CoachPair {
  switch (s.kind) {
    case 'interval':
      return {
        when: 'day',
        now: `Set to every ${coachGap(s.currentMinutes ?? 0)}.`,
        fromLog: `Every ${coachGap(s.observedMinutes ?? 0)} · ${s.samples}.`,
      };
    case 'nightGap':
      return {
        when: 'night',
        now: 'Set to the same interval day and night.',
        fromLog: `Overnight ${coachGap(s.observedMinutes ?? 0)} · ${s.samples}.`,
      };
    case 'nightInterval':
      return {
        when: 'night',
        now: `Set to every ${coachGap(s.currentMinutes ?? 0)} at night.`,
        fromLog: `Every ${coachGap(s.observedMinutes ?? 0)} · ${s.samples}.`,
      };
    case 'slotTime': {
      const set = clock(minutesToHhmm(s.currentMinutes ?? 0));
      const logged = clock(minutesToHhmm(s.observedMinutes ?? 0));
      const now = opts.name === undefined ? `Set for ${set}.` : `${opts.name} is set for ${set}.`;
      return { when: 'day', now, fromLog: `Logged at ${logged} · ${s.samples} days.` };
    }
    case 'noRule':
      return {
        when: 'day',
        now: 'No rhythm is set.',
        fromLog: `About every ${coachGap(s.observedMinutes ?? 0)} · ${s.samples}.`,
      };
    /*
      THE NAP TIMES (2026-10-01): the setting, then how far the naps the household wrote down
      started from those times, with the count. "Away", of the entries. Never the stretch awake
      before a nap: that is the nap outlook's own number.
    */
    case 'napTimes':
      return {
        when: 'day',
        now: `Naps are set for ${clockList((s.setTimes ?? []).map(clock))}.`,
        fromLog: `About ${coachGap(s.observedMinutes ?? 0)} away · ${s.samples}.`,
      };
  }
}

/**
 * The two rows as one line, for a screen reader and for the scan that holds every card against
 * the banned list. The screen draws `coachPair`, not this.
 */
export function coachHint(
  s: Suggestion,
  clock: (hhmm: string) => string,
  opts: { name?: string } = {},
): string {
  const pair = coachPair(s, clock, opts);
  return `${pair.now} ${pair.fromLog}`;
}

/**
 * THE NAP TIMES CARD'S ONE CONTROL (the owner, 2026-10-01): the Naps row's own From your log, in the
 * words of what it gives. It names the change exactly: the set times go, the heads-up is what is
 * left. On a plan without the heads-up it is drawn locked, and opens the gate instead.
 */
export const COACH_USE_HEADS_UP = 'Use a heads-up instead';

/** The one control, and it names exactly what it will change. */
export function coachAction(s: Suggestion, clock: (hhmm: string) => string): string {
  switch (s.apply.verb) {
    case 'setInterval':
      return `Set to every ${coachGap(s.apply.everyMinutes)}`;
    case 'setNight':
      return `Use ${coachGap(s.apply.nightEveryMinutes)} at night`;
    case 'setTime':
      return `Move to ${clock(s.apply.atLocalTime)}`;
    case 'openRhythm':
      return 'Set a rhythm';
    case 'useHeadsUp':
      return COACH_USE_HEADS_UP;
  }
}

/** What a parent is told after the tap: the change, in the words the card used. */
export function coachApplied(s: Suggestion, clock: (hhmm: string) => string): string {
  switch (s.apply.verb) {
    case 'setInterval':
      return `${coachNoun(s.activity)} is every ${coachGap(s.apply.everyMinutes)}`;
    case 'setNight':
      return `${coachNoun(s.activity)} is ${coachGap(s.apply.nightEveryMinutes)} at night`;
    case 'setTime':
      return `${coachNoun(s.activity)} moved to ${clock(s.apply.atLocalTime)}`;
    case 'openRhythm':
      return '';
    // the Naps row's own word for the choice it now holds
    case 'useHeadsUp':
      return 'Naps are from your log now';
  }
}

/* ------------------------------------------------------- the compact comparison (2026-10-05) */

/**
 * MANAGE SCHEDULE'S COMPACT COMPARISONS (the owner's Option 1, 2026-10-05): an interval card and a
 * night card are drawn as one row each inside their rhythm's card — the setting, an arrow, the
 * value Use would write, and the log's own middle under it. Three different numbers, kept apart:
 * `currentMinutes` is the setting, `observedMinutes` the log's middle, and the apply's minutes the
 * log's middle rounded to five (`round5`), which is what Use writes.
 */
export type CoachDaypart = 'day' | 'night' | 'allDay';

/**
 * WHICH ROW A CARD IS. An interval card on a rule with a night of its own is the DAY's (the engine
 * reads that rule's day gaps only); on a rule that runs one speed round the clock it was read
 * against every gap, so it is that rule's whole interval, "Day and night". Night cards are the
 * night's. Every other kind is not a daypart and keeps its own card.
 */
export function coachDaypart(s: Suggestion, ownNight: boolean): CoachDaypart | null {
  if (s.kind === 'interval') return ownNight ? 'day' : 'allDay';
  if (s.kind === 'nightGap' || s.kind === 'nightInterval') return 'night';
  return null;
}

export const COACH_DAYPART: Readonly<Record<CoachDaypart, string>> = {
  day: 'Day',
  night: 'Night',
  allDay: 'Day and night',
};

/** The caption beside From your log on a card that has a comparison in it. */
export const COACH_COMPARE_CAPTION = 'Current → suggested';

export interface CoachCompare {
  /** `3h` — what the rhythm is set to now for this daypart. */
  current: string;
  /** `2h 25m` — exactly what Use writes. */
  proposed: string;
  /** `Usually 2h 23m` — the middle of the log's own gaps, which Use rounds. */
  usually: string;
  /** For a screen reader: `Day, set to every 3h, suggested every 2h 25m, usually 2h 23m`. */
  spoken: string;
}

export function coachCompare(s: Suggestion, daypart: CoachDaypart): CoachCompare | null {
  const to =
    s.apply.verb === 'setInterval'
      ? s.apply.everyMinutes
      : s.apply.verb === 'setNight'
        ? s.apply.nightEveryMinutes
        : null;
  if (to === null || s.currentMinutes === null || s.observedMinutes === null) return null;
  const current = coachGap(s.currentMinutes);
  const proposed = coachGap(to);
  const observed = coachGap(s.observedMinutes);
  return {
    current,
    proposed,
    usually: `Usually ${observed}`,
    spoken: `${COACH_DAYPART[daypart]}, set to every ${current}, suggested every ${proposed}, usually ${observed}`,
  };
}

/**
 * HOW THIS IS WORKED OUT, one line per row: the log's middle, how many gaps it is the middle of, the
 * setting it was read against and what Use writes. A night card on a rule that runs one speed round
 * the clock says so, because its setting is the same interval as the day's.
 */
export function coachEvidence(s: Suggestion, daypart: CoachDaypart): string {
  const c = coachCompare(s, daypart);
  if (c === null) return '';
  const setting = s.kind === 'nightGap' ? `every ${c.current} day and night` : `every ${c.current}`;
  return `${COACH_DAYPART[daypart]}: usually every ${coachGap(s.observedMinutes ?? 0)}, the middle of ${s.samples} gaps between entries in the last 14 days. Set to ${setting}; Use sets every ${c.proposed}.`;
}

/** Under those lines: where the numbers come from, and the one rounding Use adds. */
export const COACH_COMPARE_METHOD =
  'A gap is the time from one entry to the next. Gaps under 10 minutes and over 8 hours are left ' +
  'out, and a gap belongs to the night when it starts between bedtime and waking. Use rounds the ' +
  'middle to the nearest 5 minutes. Nothing here reads your baby, only this app’s settings ' +
  'against your own log.';

export const COACH_DISMISS = 'Not this';
/**
 * TRUE AS WRITTEN. This used to promise the card "comes back if your log moves again", and it
 * never did: the id does not move with the log, which is the whole point of it. It comes back
 * when the SETTING changes (`Suggestion.id`), and the toast carries an Undo for a wrong tap.
 */
export const COACH_DISMISSED = 'Hidden on this phone';

/** The note beside a switch on What you track: the setting and the log, nothing else. */
export const COACH_UNUSED = `No entries in the last ${COACH_UNUSED_DAYS} days`;

/**
 * HOW THE LINES ARE WORKED OUT, in Routine's own "How it works". It names the window, the sample
 * floors and the threshold, because all three are boundaries this app chose and the household did
 * not — the argument `patterns/copy.ts` and `naps.copy.ts` both make for printing their own.
 */
export const COACH_METHOD =
  'From your log: a line appears under a row when that setting and the middle of your own ' +
  'entries over the last 14 days are more than about a seventh of the interval apart, and only ' +
  'once there are at least 6 gaps or 5 days of it. A rhythm with a night of its own is read ' +
  'twice: the gaps that start by day against the day, and the ones that start overnight against ' +
  'the night. Gaps under 10 minutes and over 8 hours are left out. Under Naps, a line appears ' +
  'when the naps you log start 20 minutes or more from your set nap times, over at least 6 naps ' +
  'on 5 days. Nothing here reads your baby, only this app’s settings against your own log.';
