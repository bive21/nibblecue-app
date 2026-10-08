/**
 * THE COACH — what this household's own log says about the settings this household chose.
 *
 * The owner, 2026-09-21: *"We need a 'smart' module where it's giving user inputs based on log
 * history. Learn from it and give user feedback."*
 *
 * WHERE IT IS DRAWN (the owner, 2026-09-24, "yes go ahead with both"): not on a page of its own
 * any more. A card about the feeding interval now sits UNDER THE FEEDING ROW on Routine, where the
 * interval is set; a card about the bed time sits under the Day card that holds the bed time; and a
 * module nobody uses is a note beside that module's own switch on What you track
 * (`unusedModules`). A suggestion read next to the setting it would change needs no page to
 * explain what it is about — and a page that had to be found in More was a page nobody found.
 * Since 2026-10-01 the Naps row has one of its own too: set nap times against the naps the log
 * keeps, offering the row's own From your log instead (`napTimesCard`).
 *
 * ── THE LINE THIS MODULE IS BUILT ON, BECAUSE IT IS THE WHOLE DESIGN ────────────────────────
 *
 * CLAUDE.md §7 forbids "an 'insight' that interprets data" and §2 rule 2 forbids a personalized
 * recommendation. Both are about the BABY: an app that reads a family's rows and tells them
 * something about their child's feeding, sleep or growth is making a clinical claim it has no
 * business making, and it is the claim both stores' health policies are written against.
 *
 * So this module never looks at the baby. It compares the household's own log to the household's
 * own SETTINGS, and every sentence it produces is of one shape:
 *
 *     the app is set to X · your log says Y · [change it to Y]
 *
 * "Feeding is set to every 3 hours; your own entries have been every 2h 35m over the last 41" is
 * a statement about a number in a settings screen, checked against a median of timestamps the
 * parent typed. It diagnoses nothing, it recommends nothing about a baby, and the action it
 * offers changes a field in this app. A household that ignores every card here has been told
 * nothing untrue and has missed nothing about their child.
 *
 * WHAT IT MAY NEVER BECOME, written down so the next change to this file has to argue with it:
 * a card that says a gap is long or short, that a count is high or low, that a pattern is good,
 * bad, improving or worsening, or that anybody should do anything with a baby. No card is ever
 * colored by how large its number is, none is sorted by urgency, and the ordering below is by
 * HOW FAR THE APP IS OUT OF STEP — which is a fact about a settings field.
 *
 * Every number carries the count it came from, as everywhere else in this codebase.
 *
 * Pure: no clock, no database, no React. The day boundary and the wall clock arrive as functions
 * because `packages/core` never reads a zone.
 */
import { MAX_GAP_MS, MIN_GAP_MS, type Beat } from '../schedule/foresight';
import { MIN_DAYS, MIN_TOTAL_SAMPLES, wakeWindows, type SleepLog } from '../schedule/naps';
import { isFeeding } from '../schedule/sessions';
import { MIN, type Rule } from '../schedule/types';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The window every median here is taken over — the fortnight the rest of the app uses. */
export const COACH_LOOKBACK_DAYS = 14;

/**
 * HOW MANY GAPS BEFORE THE APP MAY ARGUE WITH A SETTING A PARENT TYPED.
 *
 * Six, where the foresight lines speak at four. The bar is higher here for a reason that is not
 * statistical: foresight DESCRIBES and this PROPOSES A CHANGE, and a proposal built on a thin
 * sample is the app second-guessing somebody about their own week. Six gaps is seven entries.
 */
export const COACH_MIN_SAMPLES = 6;
/** A clock-time median needs days behind it rather than entries: five, like a usual window. */
export const COACH_MIN_DAYS = 5;

/**
 * HOW FAR OUT OF STEP IS WORTH SAYING. The larger of twenty minutes and a seventh of the
 * interval — so a three-hourly rule has to be out by half an hour before this speaks, and a
 * forty-minute one by twenty minutes. Below that the app and the log agree as well as anybody
 * could want, and a card would be noise with arithmetic on it.
 */
const COACH_DRIFT_MIN_MS = 20 * MIN;
const COACH_DRIFT_SHARE = 1 / 7;
export const driftFloor = (everyMs: number): number =>
  Math.max(COACH_DRIFT_MIN_MS, Math.round(everyMs * COACH_DRIFT_SHARE));

/** A clock time is out of step at twenty minutes: the ordinary match window, near enough. */
const COACH_TIME_DRIFT_MIN = 20;

/** Nothing logged under a module for this long, while the household was logging other things. */
export const COACH_UNUSED_DAYS = 14;

/**
 * The night this module measures against when the caller has not said. Routine always says: it
 * passes its own Day card, bed to wake (`CoachInput.night`), because that is the window the Rule
 * sheet writes onto a rule's night columns and a proposal must write the same one.
 */
const COACH_NIGHT_FROM = '22:00';
const COACH_NIGHT_TO = '06:00';
/** A night gap has to exceed the day gap by this much before offering to slow the night down. */
const COACH_NIGHT_EXTRA_MS = 45 * MIN;

/**
 * THE RHYTHMS A MISSING RULE MAY BE NAMED FOR, and no others.
 *
 * A household that logs feeds, pumps, diapers or meals at a steady interval with no rule for them
 * has a rhythm the routine could remind them of, and the card's one control opens the row where a
 * rhythm is set. Nothing else earns that card:
 *
 * - MEDICINE, never. "You have given this about every 6 hours — set a rhythm" is an app proposing
 *   when to give a medicine, which is dosing by another name (CLAUDE.md §2 rule 4). A medicine's
 *   times are the parent's to type, on its own item.
 * - SLEEP, never. Naps are on Routine from the log or at set times, and a proposed nap interval is
 *   a sleep schedule for a baby — rule 3's territory, whatever the arithmetic under it. (The one
 *   sleep card, `napTimes`, proposes no time at all: it offers to take set times away.)
 * - TUMMY TIME, BATH, TEMPERATURE and the rest: a daily goal, a cadence or a reading, not an
 *   interval. A tummy-time goal is not a rule, so a household that has one would be told the
 *   routine had "no tummy time in it" — untrue on the page it would be read on.
 */
export const COACH_RHYTHM_KEYS: readonly string[] = ['feeding', 'pump', 'diaper', 'solids'];

/**
 * THE MODULES A FORTNIGHT OF SILENCE MEANS ANYTHING FOR: the ones a household that uses them logs
 * most days. A fortnight without a vaccine, a growth reading, a temperature or a medicine is an
 * ordinary fortnight, and the list this replaced named all four to every household that had them
 * on — so the note a parent could act on was buried under four they could not.
 */
export const COACH_DAILY_MODULES: readonly string[] = [
  'bottle',
  'breastfeed',
  'pump',
  'diaper',
  'sleep',
  'solids',
  'tummy',
  'bath',
];

export type CoachKind =
  'interval' | 'slotTime' | 'nightGap' | 'nightInterval' | 'noRule' | 'napTimes';

export type CoachApply =
  | { verb: 'setInterval'; ruleId: string; everyMinutes: number }
  | { verb: 'setTime'; ruleId: string; atLocalTime: string }
  | {
      verb: 'setNight';
      ruleId: string;
      nightEveryMinutes: number;
      nightFrom: string;
      nightTo: string;
    }
  /** No rule to change: the card opens the row's own sheet, where a rhythm is set by hand. */
  | { verb: 'openRhythm'; activity: string }
  /**
   * THE NAPS ROW'S OFF, FROM ITS CARD (`napTimes`, 2026-10-01): every rule the Naps row owns goes,
   * the way the Naps sheet's Off takes them, and the heads-up from the log is what is left. The
   * page decides which rules those are when the card is tapped, from the rows it is drawing, and
   * the bedtime is never one of them: it is the Day card's.
   */
  | { verb: 'useHeadsUp'; activity: 'sleep' };

export interface Suggestion {
  /**
   * STABLE ACROSS RECOMPUTES, because a dismissal has to stick. It is keyed on the kind, the thing
   * it is about and the SETTING as it stands — never on the log's numbers, or waving a card away
   * would last until the median moved by a minute and the same card came back wearing a different
   * id. The setting is in it because "not this" was said about that setting: a parent who later
   * changes the interval by hand has a new setting, and a new disagreement with it is a new card.
   */
  id: string;
  kind: CoachKind;
  activity: string;
  ruleId: string | null;
  /** How many gaps, days or entries the claim rests on. Shown in every sentence. */
  samples: number;
  /** What the app is set to, in minutes — or minutes past local midnight for a `slotTime`. */
  currentMinutes: number | null;
  /** What the log says, in the same unit. */
  observedMinutes: number | null;
  /**
   * `napTimes` only: the set nap times it is about, `HH:MM`, once each, in clock order, so the
   * line can name every one of them as the Naps row does. Its `observedMinutes` is how far, in the
   * middle, the logged naps started from the nearest of those times (its `driftMinutes` too), and
   * its `samples` how many naps that was. Never the stretch awake before them: that is the nap
   * outlook's number, which is Plus, and this card is drawn on every plan.
   */
  setTimes?: readonly string[];
  apply: CoachApply;
  /** How far the SETTING is from the LOG. The sort key, and never a measure of urgency. */
  driftMinutes: number;
}

/**
 * WHAT THE NAP TIMES CARD READS (`napTimes`, 2026-10-01): the Naps row's own set times for the
 * child the cards are about, and that child's sleep log as the nap outlook reads it.
 */
export interface CoachNaps {
  /**
   * THE NAPS ROW'S SET TIMES: the child's live FIXED sleep rules that are not the bedtime, which
   * the app picks with the very function its Naps sheet does (`ownedRules(…, 'sleep', …).times`).
   * Core does not know the bedtime's name, so it is told which rules are naps rather than guessing.
   */
  times: readonly Rule[];
  /** The child's sleeps, ends included, a running one among them (`useNapOutlook`'s own logs). */
  logs: readonly SleepLog[];
}

export interface CoachInput {
  nowMs: number;
  rules: readonly Rule[];
  /** Every logged start in the lookback — `foresightBeats`, already scoped to the viewer. */
  beats: readonly Beat[];
  /** Module ids that are on. Empty means "everything", as elsewhere in this codebase. */
  enabled: ReadonlySet<string>;
  /** Local midnight for an instant, in the household's own zone. */
  dayStartOf: (ms: number) => number;
  /** Minutes since local midnight for an instant. */
  wallMinutes: (ms: number) => number;
  /**
   * THE HOUSEHOLD'S OWN NIGHT, `HH:MM` to `HH:MM` — Routine's Day card, bed to wake. It is where
   * a rule with no night of its own is split into day and night, and it is the window a proposed
   * night is written with, so the change a card makes is the change the Rule sheet would have
   * made (`nightColumns` writes the Day's bed and wake too). `COACH_NIGHT_*` without it.
   */
  night?: { from: string; to: string };
  /**
   * THE NAP TIMES AND THE SLEEP LOG (`CoachNaps`), for the one card that reads sleeps whole rather
   * than as starts. Absent, that card is never drawn and everything else is as it was.
   */
  naps?: CoachNaps;
  /** Ids the household has already waved away. */
  dismissed?: ReadonlySet<string>;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid] ?? 0;
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** Minutes, to the nearest five. A proposal a parent reads has to be a number they would type. */
export const round5 = (minutes: number): number => Math.max(5, Math.round(minutes / 5) * 5);

/** `HH:MM` from minutes past local midnight, wrapped. */
export const hhmmOfMinutes = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * WHICH ENTRIES ANSWER A RULE. The schedule engine's own scope, restated over beats: a feeding
 * rule is satisfied by either kind of feed, everything else by its own activity. It cannot
 * import `sessionsFor` — that takes sessions, and a beat is a start and an activity.
 */
const beatsFor = (activity: string, beats: readonly Beat[]): Beat[] =>
  beats.filter(b => (isFeeding(activity) ? isFeeding(b.activity) : b.activity === activity));

/** The gaps between consecutive starts, with the double-logs and the overnight holes dropped. */
export function gapsOf(starts: readonly number[]): number[] {
  const s = [...starts].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 1; i < s.length; i += 1) {
    const gap = (s[i] ?? 0) - (s[i - 1] ?? 0);
    if (gap >= MIN_GAP_MS && gap <= MAX_GAP_MS) out.push(gap);
  }
  return out;
}

const inWindowMinutes = (minute: number, from: number, to: number): boolean =>
  from < to ? minute >= from && minute < to : minute >= from || minute < to;

const hmOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The same gaps as `gapsOf`, sorted into the night's and the day's. A gap belongs to the night
 * when it BEGINS in it: it is the stretch after that entry.
 */
function splitGaps(
  starts: readonly number[],
  window: { from: string; to: string },
  wallMinutes: (ms: number) => number,
): { day: number[]; night: number[] } {
  const from = hmOf(window.from);
  const to = hmOf(window.to);
  const sorted = [...starts].sort((a, b) => a - b);
  const day: number[] = [];
  const night: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = (sorted[i] ?? 0) - (sorted[i - 1] ?? 0);
    if (gap < MIN_GAP_MS || gap > MAX_GAP_MS) continue;
    (inWindowMinutes(wallMinutes(sorted[i - 1] ?? 0), from, to) ? night : day).push(gap);
  }
  return { day, night };
}

/**
 * THE CARDS. Read in one pass over the rules and one over the logged rhythms, each producing at
 * most one card of a kind, ordered by how far the app is out of step.
 *
 * THERE IS NO CAP ANY MORE. The old page cut its list to five so that it read as a short list of
 * decisions; on Routine every card sits under the one row it would change, so the number of them
 * is bounded by the household's own rules, and a cap would hide the card for the sixth row while
 * drawing that row as if the log agreed with it.
 */
export function coach(input: CoachInput): Suggestion[] {
  const since = input.nowMs - COACH_LOOKBACK_DAYS * DAY;
  const beats = input.beats.filter(b => b.startMs >= since && b.startMs <= input.nowMs);
  const dismissed = input.dismissed ?? new Set<string>();
  const household = input.night ?? { from: COACH_NIGHT_FROM, to: COACH_NIGHT_TO };
  const on = (activity: string): boolean =>
    input.enabled.size === 0 ||
    input.enabled.has(activity) ||
    (isFeeding(activity) && (input.enabled.has('bottle') || input.enabled.has('breastfeed')));
  const live = input.rules.filter(r => r.isActive && on(r.activity));
  const out: Suggestion[] = [];

  for (const rule of live) {
    const mine = beatsFor(rule.activity, beats).map(b => b.startMs);

    /* ── the interval a household set, against the one they keep ─────────────────────────── */
    if (rule.ruleType === 'INTERVAL' && (rule.everyMinutes ?? 0) > 0) {
      const everyMs = (rule.everyMinutes as number) * MIN;
      const ownNight = rule.nightMode !== 'NONE';
      /*
        A RULE WITH A NIGHT OF ITS OWN IS COMPARED BY DAY. Its every-minutes is the DAY's interval
        — the night runs on columns of its own — so a median that took the night's gaps in as well
        was pulled toward a number the setting never claimed, and a household keeping to "every 3h,
        nights every 5h" to the minute could be told its day was every 3h 40m. A rule that runs
        one speed round the clock claims every gap, and is read against every gap.
      */
      const split = splitGaps(
        mine,
        ownNight && rule.nightFrom !== null && rule.nightTo !== null
          ? { from: rule.nightFrom, to: rule.nightTo }
          : household,
        input.wallMinutes,
      );
      const gaps = ownNight ? split.day : [...split.day, ...split.night];
      if (gaps.length >= COACH_MIN_SAMPLES) {
        const observed = median(gaps);
        const drift = Math.abs(observed - everyMs);
        if (drift >= driftFloor(everyMs)) {
          out.push({
            id: `interval:${rule.id}:${rule.everyMinutes}`,
            kind: 'interval',
            activity: rule.activity,
            ruleId: rule.id,
            samples: gaps.length,
            currentMinutes: rule.everyMinutes,
            observedMinutes: Math.round(observed / MIN),
            apply: {
              verb: 'setInterval',
              ruleId: rule.id,
              everyMinutes: round5(observed / MIN),
            },
            driftMinutes: Math.round(drift / MIN),
          });
        }
      }

      /* ── and the night, when the rule runs one speed round the clock ──────────────────── */
      if (
        !ownNight &&
        split.night.length >= COACH_MIN_SAMPLES &&
        split.day.length >= COACH_MIN_SAMPLES
      ) {
        const nightMs = median(split.night);
        const dayMs = median(split.day);
        if (nightMs - dayMs >= COACH_NIGHT_EXTRA_MS) {
          out.push({
            id: `nightGap:${rule.id}`,
            kind: 'nightGap',
            activity: rule.activity,
            ruleId: rule.id,
            samples: split.night.length,
            currentMinutes: rule.everyMinutes,
            observedMinutes: Math.round(nightMs / MIN),
            apply: {
              verb: 'setNight',
              ruleId: rule.id,
              nightEveryMinutes: round5(nightMs / MIN),
              nightFrom: household.from,
              nightTo: household.to,
            },
            driftMinutes: Math.round((nightMs - dayMs) / MIN),
          });
        }
      }
    }

    /*
      ── AND THE NIGHT A RULE KEEPS OF ITS OWN, against the nights the log keeps ──────────────
      The owner, 2026-09-28, of a feeding line that read "every 2h 10m": *"is this only considering
      during the day? what about the night prediction model?"*. It was: a rule with a night of its
      own was compared by day (above), and its night interval was never read at all, so setup's
      night (the day's interval plus an hour) stood unchallenged however the nights went. The
      night's gaps are the ones that begin inside the rule's own window, the same split the day
      was measured from, and the bar is the day's: six gaps, a seventh of the interval.

      Only a LONGER night has an interval to compare. ONE is a clock time and PAUSE is no reminders
      at night, both the parent's choice of how nights are kept, and a card proposing an interval
      would be the app choosing a different kind of night for them.
    */
    if (
      rule.ruleType === 'INTERVAL' &&
      rule.nightMode === 'LONGER' &&
      (rule.everyMinutes ?? 0) > 0 &&
      (rule.nightEveryMinutes ?? 0) > 0
    ) {
      const window =
        rule.nightFrom !== null && rule.nightTo !== null
          ? { from: rule.nightFrom, to: rule.nightTo }
          : household;
      const nights = splitGaps(mine, window, input.wallMinutes).night;
      if (nights.length >= COACH_MIN_SAMPLES) {
        const setMs = (rule.nightEveryMinutes as number) * MIN;
        const observed = median(nights);
        const drift = Math.abs(observed - setMs);
        if (drift >= driftFloor(setMs)) {
          out.push({
            id: `nightInterval:${rule.id}:${rule.nightEveryMinutes}`,
            kind: 'nightInterval',
            activity: rule.activity,
            ruleId: rule.id,
            samples: nights.length,
            currentMinutes: rule.nightEveryMinutes,
            observedMinutes: Math.round(observed / MIN),
            apply: {
              verb: 'setNight',
              ruleId: rule.id,
              nightEveryMinutes: round5(observed / MIN),
              nightFrom: window.from,
              nightTo: window.to,
            },
            driftMinutes: Math.round(drift / MIN),
          });
        }
      }
    }

    /* ── the clock a reminder is set to, against the clock it is answered at ─────────────── */
    if (rule.ruleType === 'FIXED' && rule.atLocalTime !== null) {
      const slot = hmOf(rule.atLocalTime);
      /*
        THE ENTRIES THAT BELONG TO THIS SLOT, and no others: one a day at most, and only within
        three hours of the slot's own clock time. A household on 7:00 · 10:00 · 13:00 has three
        rules and one pool of feeds, so a median over the whole pool would propose the middle of
        the day for every one of them. Three hours is wide enough to see a slot a household has
        quietly moved and narrow enough that the next slot's entries cannot reach it.
      */
      const near = new Map<number, number>();
      for (const at of mine) {
        const minute = input.wallMinutes(at);
        let delta = minute - slot;
        if (delta > 720) delta -= 1440;
        if (delta < -720) delta += 1440;
        if (Math.abs(delta) > 180) continue;
        const day = input.dayStartOf(at);
        const held = near.get(day);
        if (held === undefined || Math.abs(delta) < Math.abs(held)) near.set(day, delta);
      }
      const deltas = [...near.values()];
      if (deltas.length >= COACH_MIN_DAYS) {
        const drift = median(deltas);
        if (Math.abs(drift) >= COACH_TIME_DRIFT_MIN) {
          const observed = slot + drift;
          out.push({
            id: `slotTime:${rule.id}:${rule.atLocalTime}`,
            kind: 'slotTime',
            activity: rule.activity,
            ruleId: rule.id,
            samples: deltas.length,
            currentMinutes: slot,
            observedMinutes: Math.round(observed),
            apply: {
              verb: 'setTime',
              ruleId: rule.id,
              atLocalTime: hhmmOfMinutes(round5(observed)),
            },
            driftMinutes: Math.round(Math.abs(drift)),
          });
        }
      }
    }
  }

  /* ── the nap times a household set, against the naps its log keeps (`napTimesCard`) ──────── */
  if (input.naps !== undefined && on('sleep')) {
    const card = napTimesCard(input.naps, input);
    if (card !== null) out.push(card);
  }

  /*
    ── A RHYTHM THE HOUSEHOLD KEEPS AND THE ROUTINE HAS NEVER HEARD OF ────────────────────────
    Only for `COACH_RHYTHM_KEYS`, which says why the others are left out. It only ever sees an
    INTRA-DAY rhythm, because `gapsOf` drops anything over eight hours as a night or a hole in the
    logging — a once-every-few-days habit is a CADENCE, its gaps are indistinguishable from a
    fortnight of not logging, and the app guessing at one would be guessing.
  */
  const ruled = new Set<string>(live.map(r => (isFeeding(r.activity) ? 'feeding' : r.activity)));
  const byActivity = new Map<string, number[]>();
  for (const b of beats) {
    const key = isFeeding(b.activity) ? 'feeding' : b.activity;
    const list = byActivity.get(key);
    if (list) list.push(b.startMs);
    else byActivity.set(key, [b.startMs]);
  }
  for (const [key, starts] of byActivity) {
    if (ruled.has(key) || !COACH_RHYTHM_KEYS.includes(key)) continue;
    // the feeding row is the bottle's, as on Routine: it stands for both kinds of feed
    const activity = key === 'feeding' ? 'bottle' : key;
    if (!on(activity)) continue;
    const gaps = gapsOf(starts);
    if (gaps.length < COACH_MIN_SAMPLES * 2) continue;
    out.push({
      id: `noRule:${key}`,
      kind: 'noRule',
      activity,
      ruleId: null,
      samples: gaps.length,
      currentMinutes: null,
      observedMinutes: Math.round(median(gaps) / MIN),
      apply: { verb: 'openRhythm', activity },
      driftMinutes: 0,
    });
  }

  /*
    THE ORDER IS HOW FAR THE APP IS OUT OF STEP, largest first, and then the sample behind it.
    It is deliberately NOT how much of anything there is, how late anybody is, or anything that
    could be read as urgency: the top card is the setting that disagrees most with the log, which
    is a fact about a settings field and nothing else. Ties break on the id so two recomputes of
    one afternoon cannot reorder a row's cards under a parent's thumb.
  */
  return out
    .filter(s => !dismissed.has(s.id))
    .sort(
      (a, b) =>
        b.driftMinutes - a.driftMinutes || b.samples - a.samples || a.id.localeCompare(b.id),
    );
}

/** Minutes apart on a clock face, the short way round. */
const clockApart = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
};

/**
 * SET NAP TIMES, AGAINST THE NAPS THE LOG KEEPS (the owner, 2026-10-01: *"what if it already has
 * preset nap times by user? the smart nap outlook schedule should precede the set up time or not?
 * perhaps ask user if they want to switch to smart nap outlook reminder?"*).
 *
 * Set times win, and the nap heads-up never rings beside them (`apps/mobile/src/notifications/
 * plan.ts`), so a household whose set times no longer match its naps is the one household that
 * cannot meet the heads-up by itself. This is where it is asked, under the Naps row, in the coach's
 * own shape: the setting ("Naps are set for 9:30 AM and 1:00 PM"), the household's own log with
 * its count ("over the last 9, naps started about 40m away from those times"), and one change, the Naps
 * row's own From your log. It says nothing about the baby: not that a nap was late or early, not
 * that a time is right, only that the app's setting and the household's entries are apart.
 *
 * THREE CONDITIONS, ALL OF THEM:
 *   - THE HOUSEHOLD HAS SET NAP TIMES (`CoachNaps.times`), or there is nothing to switch from;
 *   - THE OUTLOOK SPEAKS FOR THIS CHILD: the windows `napOutlook` itself waits for before it names
 *     any sleep (`MIN_TOTAL_SAMPLES` over `MIN_DAYS`), or the heads-up offered would be silent;
 *   - THE LOGGED NAPS START `COACH_TIME_DRIFT_MIN` OR MORE FROM THE SET TIMES: the middle of each
 *     nap's distance to its nearest set time, so a household that keeps its times to the minute and
 *     has one odd afternoon is not asked.
 * And at the coach's own bar for a PROPOSAL, which is higher than the outlook's for a description
 * (`COACH_MIN_SAMPLES` naps on `COACH_MIN_DAYS` days): a proposal on a thin sample is the app
 * second-guessing a parent about their own week (docs/COACH_AND_SEARCH.md §2).
 *
 * The naps are the outlook's own reading of the log (`wakeWindows`: a nap logged in two pieces is
 * one nap, a waking in the night is no window, a stretch that hid a nap nobody logged is left out),
 * so the card and the heads-up it offers are the same arithmetic. The middles are plain medians, as
 * everywhere else in this file; the heads-up's own sentence weights recent days more.
 */
function napTimesCard(naps: CoachNaps, input: CoachInput): Suggestion | null {
  const set = naps.times.filter(
    r => r.isActive && r.activity === 'sleep' && r.ruleType === 'FIXED' && r.atLocalTime !== null,
  );
  if (set.length === 0) return null;
  const windows = wakeWindows(naps.logs, input.nowMs, input.dayStartOf);
  const days = new Set(windows.map(w => input.dayStartOf(w.wokeAtMs))).size;
  if (windows.length < MIN_TOTAL_SAMPLES || days < MIN_DAYS) return null;
  const before = windows.filter(w => !w.nextIsNight);
  const napDays = new Set(before.map(w => input.dayStartOf(w.nextStartMs))).size;
  if (before.length < COACH_MIN_SAMPLES || napDays < COACH_MIN_DAYS) return null;
  const times = [...new Set(set.map(r => r.atLocalTime as string))].sort();
  const off = before.map(w => {
    const at = input.wallMinutes(w.nextStartMs);
    return Math.min(...times.map(t => clockApart(at, hmOf(t))));
  });
  const drift = median(off);
  if (drift < COACH_TIME_DRIFT_MIN) return null;
  return {
    // the setting as it stands: these rules at these times. A time added, moved or taken away is a
    // new setting, and a new disagreement with it is a new card
    id: `napTimes:${set
      .map(r => `${r.id}@${r.atLocalTime as string}`)
      .sort()
      .join(',')}`,
    kind: 'napTimes',
    activity: 'sleep',
    ruleId: null,
    samples: before.length,
    currentMinutes: null,
    observedMinutes: Math.round(drift),
    setTimes: times,
    apply: { verb: 'useHeadsUp', activity: 'sleep' },
    driftMinutes: Math.round(drift),
  };
}

export interface UnusedInput {
  nowMs: number;
  /**
   * Entries per activity type over the last `COACH_UNUSED_DAYS`, every caregiver's private ones
   * included. Only WHETHER a module has any is read, never what they are — and leaving another
   * parent's private pumps out would tell this reader "Pumping: no entries" about a module the
   * other parent uses every day, beside the switch that would turn it off for both of them.
   */
  counts: Readonly<Record<string, number>>;
  /** The modules that are on, in the order the page lists them. */
  enabled: readonly string[];
  /** The household's first entry of any kind, or null before there is one. */
  firstEntryMs: number | null;
}

/**
 * A MODULE THAT IS ON AND HAS HAD NOTHING IN IT FOR A FORTNIGHT — the note What you track draws
 * beside that module's own switch. It is a fact about a setting ("this is on; nothing has been
 * logged under it") and the change it points at is the switch it is printed next to, so it has no
 * control of its own.
 *
 * TWO GUARDS, and each is the difference between a useful note and an insult:
 *
 * - SOMETHING WAS LOGGED IN THE FORTNIGHT. A household that put the app down for three weeks has
 *   logged nothing anywhere, and greeting them on their way back with "no entries" beside every
 *   switch is the app telling them off for a fortnight it knows nothing about. Only a household
 *   that HAS been logging can have a module nobody is using.
 * - THE LOG IS A FORTNIGHT OLD. A household three days in has not had a fortnight of anything,
 *   and "no entries in the last 14 days" would be a sentence about days before they arrived.
 *
 * What it cannot know is when a switch was turned on — the account's module rows carry no date —
 * so a module switched on this morning in a household that has logged for a month is noted too.
 * The sentence is still true, and the parent who flipped the switch knows why.
 */
export function unusedModules(input: UnusedInput): string[] {
  if (input.firstEntryMs === null) return [];
  if (input.nowMs - input.firstEntryMs < COACH_UNUSED_DAYS * DAY) return [];
  const total = Object.values(input.counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];
  return input.enabled.filter(m => COACH_DAILY_MODULES.includes(m) && (input.counts[m] ?? 0) === 0);
}
