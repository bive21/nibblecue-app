/**
 * WHAT THE NAP OUTLOOK SAYS.
 *
 * Every sentence here is a statement about rows the household typed, with the number of rows
 * attached to it. None of them is about the baby.
 *
 * THE LINE, RESTATED WHERE IT IS EASIEST TO CROSS. This module is the one in the app most
 * tempting to write badly, because the interesting sentence is always one word away from a
 * diagnosis: "Ada has been awake 2h 10m" is arithmetic, and "Ada has been awake 2h 10m —
 * longer than usual" is a claim about a baby's condition dressed as a comparison. Neither
 * "longer" nor "shorter" appears here, and no window is ever compared to another. The one
 * sentence that speaks to the parent is the thin card's invitation to keep logging, and it
 * names the card and the count, never the baby. `BANNED` (shared with the foresight copy) is
 * enforced over these strings by `naps.test.ts`; the reasoning behind the line, and the
 * owner's 2026-09-18 narrowing of CLAUDE.md §2 rule 6 that permits the prediction at all, is
 * recorded at the top of `foresight.copy.ts`.
 *
 * WHY IT MAY SAY "NEXT NAP ABOUT 2:40". Because it is the household's own median added to a
 * timestamp they wrote, it says so in the sentence, and the owner asked for exactly this. It
 * is not an instruction: a parent who reads it and keeps the baby up has not been contradicted.
 */
import { MIN_DAYS, NAP_LOOKBACK_DAYS, type NapOutlook, type SleepKindNext } from './naps';

/** The card on Today. It covers naps and the night, so the name says sleep (2026-10-04). */
export const NAP_HEADER = 'Sleep outlook';

/** `1h 50m` · `35m` — the same shape `foresightGap` uses, so two cards cannot spell it differently. */
export function napLength(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * THE BIG NOW FIGURE on Sleep outlook (the owner, 2026-10-04). `35 min` · `1h 30m` · `2h`.
 * Hours and minutes only: a running sleep still comes from the timer, and the seconds
 * stay off the card. The completed minute is what is shown, so 35m 40s stays `35 min`.
 */
export function sleepSpan(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * WHICH WAKE OF THE DAY THIS IS, in words a parent uses. Past the fourth it stops counting and
 * says "later in the day": a household with six naps has a sixth window, but "your sixth window"
 * is a number nobody thinks in, and the sample count is already carrying the precision.
 */
const ORDINAL: Readonly<Record<number, string>> = {
  1: 'after the night',
  2: 'after the first nap',
  3: 'after the second nap',
  4: 'after the third nap',
};
export const positionWord = (position: number): string => ORDINAL[position] ?? 'later in the day';

/**
 * STILL COLLECTING — the honest answer before there is a middle to take. It prints the count so
 * far, which is the progress, and it says what will show up and when, so a household with one
 * nap can see the card is waiting on their own entries. A silence would not say that, and a
 * number built on one window would be worse than either (`patterns/copy.ts` says the same thing
 * about a usual window).
 *
 * The invitation asks them to keep logging and nothing else (the owner, 2026-10-03). It never
 * says the log is short, and it never says anything about the baby.
 */
export const napWatching = (samples: number, days: number): string => {
  const shows = `The usual awake time shows here after ${MIN_DAYS} full days.`;
  // NO "no sleep logged yet": nothing counted is not nothing logged. A baby's first nap, running
  // on its timer, has no wake window around it yet, and the card said "No sleep logged yet" beside
  // the sleep that was plainly going (2026-09-26). With nothing counted, the invitation alone is
  // what is true.
  if (samples === 0) return `Every nap and night you log fills this in. ${shows}`;
  const windows = `${samples} wake window${samples === 1 ? '' : 's'}`;
  const over = `${days} day${days === 1 ? '' : 's'}`;
  const progress = `${windows} over ${over} so far. Keep logging.`;
  // Two days can still be short of the windows the middle needs. Saying "after 2 full days"
  // again would tell a household that already has them that the card is waiting on a day it has.
  if (days >= MIN_DAYS)
    return `${progress} A few more wake windows and the usual awake time shows here.`;
  return `${progress} ${shows}`;
};

/** `Awake 1h 20m` · `Asleep 35m` — a fact off the clock and the log, and nothing more. */
export const awakeFor = (ms: number): string => `Awake ${napLength(ms)}`;
export const asleepFor = (ms: number): string => `Asleep ${napLength(ms)}`;

/**
 * THE CLOSED CARD'S TWO CAPTIONS (2026-10-03). The figures used to sit side by side with no
 * names, so "Asleep 2m" and "6:26 PM" read as one fact, and stopping the nap swapped 6:26 PM
 * for 9:00 PM with nothing to say the first was the usual end of this sleep and the second is
 * the next one. The caption is the name. The long sentence stays under the fold.
 */
export const NAP_ASLEEP_LABEL = 'Asleep';
export const NAP_AWAKE_LABEL = 'Awake';

/**
 * Which clock the right-hand figure is. While asleep it is when this sleep usually ends
 * (`wakeAtMs`). Awake, it is the next nap or bedtime (`nextAtMs`). Awake in the night there is
 * no next sleep to name, so the figure is the usual morning (`usualMorningMs`), the same clock
 * the night sentence already uses. Null when that figure is not drawn.
 */
export function napClockLabel(o: NapOutlook): string | null {
  if (o.state === 'asleep') return o.wakeAtMs === null ? null : 'Usually up';
  if (o.nextAtMs !== null) return o.nextKind === 'night' ? 'Bedtime' : 'Next nap';
  if (o.nextKind === 'night' && o.usualMorningMs !== null) return 'Usually up';
  return null;
}

/**
 * A GAP IN THE LOG: when the last LOGGED sleep ended. It is a fact about the log, and it replaces
 * "Awake 11h" deliberately — after a day at daycare nobody copied in, eleven hours awake is what
 * the log says and not what happened.
 */
export const nothingLoggedSince = (clock: string, forMs: number): string =>
  // past a day the clock alone would read as this morning's; the day is the honest unit then
  forMs >= 24 * 60 * 60_000 ? 'No sleep logged in the last day' : `No sleep logged since ${clock}`;

/** …and, in the daytime, all there is to add until the next sleep reaches the log. */
export const NAP_GAP_LINE = 'The outlook picks up again from the next sleep logged.';

/**
 * THE WORKING, ALWAYS SHOWN. "Ada is usually awake about 1h 50m after the first nap, and down about
 * 1:10 — over 9" names both halves of the prediction — the usual window from the waking and the
 * usual time on the clock — where they came from, and how many are behind them, so a parent can
 * weigh the time above it without taking the app's word for anything. Before the night it names
 * the run-up to the night instead of a position.
 */
export const napWindowLine = (
  o: NapOutlook,
  baby: string,
  clock?: (ms: number) => string,
): string | null => {
  // a gap in the log: the night by the usual bedtime alone, and nothing counted from a waking
  if (o.basis === 'clock') {
    if (clock === undefined || o.usualStartMs === null) return null;
    const who = baby === '' ? 'Usually' : `${baby} usually goes`;
    return `${who} down for the night about ${clock(o.usualStartMs)}, over the last ${o.samples}.`;
  }
  if (o.awakeMs === null) return null;
  const where =
    o.nextKind === 'night'
      ? ' before the night'
      : o.basis === 'position'
        ? ` ${positionWord(o.position)}`
        : '';
  const who = baby === '' ? 'Usually' : `${baby} is usually`;
  const down =
    clock === undefined || o.usualStartMs === null
      ? ''
      : `, and down about ${clock(o.usualStartMs)}`;
  return `${who} awake about ${napLength(o.awakeMs)}${where}${down}, over the last ${o.samples}.`;
};

/**
 * A WINDOW'S TWO CLOCKS, with a shared AM/PM said once at the end: `2:15–2:35 PM`, `11:50 AM–12:10
 * PM`, `14:15–14:35` (2026-10-08). The same words on Today, in the heads-up and on the lock screen.
 */
export function clockRange(from: string, to: string): string {
  const m = / ?(AM|PM|am|pm|a\.m\.|p\.m\.)$/.exec(from);
  const head =
    m !== null && m[1] !== undefined && to.endsWith(m[1]) ? from.slice(0, m.index) : from;
  return `${head}–${to}`;
}

/**
 * THE PREDICTION ITSELF, and the conditional is not decoration: "if today runs like the usual"
 * is the whole claim. Take it out and the sentence becomes a schedule the household did not set.
 * It names which sleep it means, because the household's own evenings say which comes next.
 */
export const nextSleepLine = (kind: SleepKindNext | null, clock: string): string => {
  const which = kind === 'night' ? 'Night sleep' : kind === 'nap' ? 'Next nap' : 'Next sleep';
  return `${which} about ${clock} if today runs like the usual.`;
};

/**
 * While asleep: how long a nap at this point of the day usually runs, and to when — or, for the
 * night, when the household's mornings usually start. Awake in the night it is the same night
 * sentence, because the night is not over.
 *
 * ONCE THIS NAP HAS RUN PAST THE SHORT ONES, the sentence says so, because the number changed
 * underneath it: "Naps here that got this far usually ran about 1h 35m" is the middle of the naps
 * that lasted at least this long, which is a different set from "naps here". It selects rows; it
 * compares nothing to anything.
 */
export const napLengthLine = (o: NapOutlook, clock: (ms: number) => string): string | null => {
  if (o.nextKind === 'night') {
    if (o.usualMorningMs === null) return null;
    return `Nights usually end about ${clock(o.usualMorningMs)}, over the last ${o.morningSamples}.`;
  }
  if (o.usualNapMs === null) return null;
  if (o.outlastedSome && o.lastingNapMs !== null && o.wakeAtMs !== null) {
    const naps = o.lastingBasis === 'position' ? 'Naps here' : 'Naps';
    return (
      `${naps} that got this far usually ran about ${napLength(o.lastingNapMs)}, ` +
      `to about ${clock(o.wakeAtMs)}, over the last ${o.lastingSamples}.`
    );
  }
  const naps = o.basis === 'position' ? 'Naps here' : 'Naps';
  const to = o.wakeAtMs === null ? '' : `, to about ${clock(o.wakeAtMs)}`;
  return `${naps} usually run about ${napLength(o.usualNapMs)}${to}, over the last ${o.napSamples}.`;
};

/**
 * THE NAP AND BEDTIME HEADS-UP (2026-09-28): the notification fifteen minutes before the sleep the
 * outlook names (`napAsRhythm`, planned by `apps/mobile/src/notifications/plan.ts`). The title is
 * the prediction and its clock, "Nap time for Ada around 10:40 AM"; the line under it is where the
 * number came from, the household's usual stretch awake before that sleep and how many it was taken
 * over. Nothing about how the baby is (no tired, no sleepy), no instruction, no comparison, no
 * pronoun: the phone knows a name, not how the baby is referred to.
 */
export const napHeadsUpTitle = (
  kind: SleepKindNext,
  baby: string,
  clock: string,
  /** `clock` is a window ("10:30–10:50 AM"), which needs no "around" (2026-10-08). */
  window = false,
): string => {
  const what = kind === 'night' ? 'Bedtime' : 'Nap time';
  const when = window ? clock : `around ${clock}`;
  return baby === '' ? `${what} ${when}` : `${what} for ${baby} ${when}`;
};

/**
 * `Naps have started about 2h 10m after waking, over the last 9.` With no stretch to go on (the
 * outlook named the usual bedtime alone, after a gap in the log), the time in the title is the
 * household's own usual one, and the line says that instead.
 */
export const napHeadsUpLine = (
  kind: SleepKindNext,
  windowMs: number | null,
  samples: number,
): string => {
  const which = kind === 'night' ? 'Nights' : 'Naps';
  const when = windowMs === null ? 'around then' : `about ${napLength(windowMs)} after waking`;
  return `${which} have started ${when}, over the last ${samples}.`;
};

/**
 * The same, inside a heads-up that carries a feed or a pump too: the clock goes in the sentence,
 * because the merged title ("2 things around now for Ada") has none.
 */
export const napHeadsUpPart = (
  kind: SleepKindNext,
  clock: string,
  windowMs: number | null,
  samples: number,
  window = false,
): string => {
  const what = kind === 'night' ? 'Bedtime' : 'Nap time';
  const which = kind === 'night' ? 'nights' : 'naps';
  const when = windowMs === null ? 'around then' : `about ${napLength(windowMs)} after waking`;
  return `${what} ${window ? clock : `around ${clock}`}: ${which} have started ${when}, over the last ${samples}.`;
};

/** `2 naps today · usually 3` — two counts side by side, with no verdict on the gap between. */
export const napsTodayLine = (o: NapOutlook): string => {
  const today = `${o.napsToday} nap${o.napsToday === 1 ? '' : 's'} today`;
  return o.napsPerDay === null ? today : `${today} · usually ${o.napsPerDay}`;
};

/**
 * HOW THE NUMBERS WERE MADE, in one line under the fold (the owner, 2026-10-03: the open card was
 * a screen of text). The sentence above it already carries the usual stretch, the clock and the
 * count. This names only what a parent needs in order to trust that line: whose entries, how
 * recent, and that the time is those two blended. The filters, the 1.8 share and the clock-change
 * rule stay in `docs/NAP_OUTLOOK.md`, not on Today.
 */
export const NAP_METHOD =
  `From your own sleep entries on this phone, after ${MIN_DAYS} full days. Recent days count ` +
  `more, and nothing older than ${NAP_LOOKBACK_DAYS} days counts. The time blends your usual ` +
  'stretch awake with the usual clock time.';

/**
 * THE CARD'S OWN WORDS (2026-10-04). The engine is unchanged. These name what it already
 * computed: Now, the next clock, and a short list under the fold. A time from the log says
 * Around. Nothing here is a plan the household typed into the routine, so none of them says
 * Planned. The long account of the blend stays in `NAP_METHOD` and in `docs/NAP_OUTLOOK.md`,
 * not on the card.
 */
export const SLEEP_NOW = 'Now';
export const SLEEP_DISCLOSURE = 'What this means';
/** The fold on a calm card (gap / learning), where there is no estimate to explain yet. */
export const SLEEP_DETAILS = 'Details';
export const SLEEP_PATTERN = 'Your recent pattern';
export const SLEEP_ESTIMATE = 'This is an estimate from your sleep logs.';
export const SLEEP_STALE = 'Waiting for a sleep update';
export const sleepStaleWake = (when: string): string => `Last wake-up logged at ${when}`;
export const SLEEP_STALE_MORE =
  "There isn't a current estimate. Add the latest sleep entry to refresh your outlook.";
export const SLEEP_LEARNING = 'Building your sleep pattern';
export const SLEEP_LEARNING_BODY = 'More sleep entries are needed for an estimate.';
export const SLEEP_ACTIVE_LEARNING = 'Learning your pattern';
export const SLEEP_UNAVAILABLE = 'Estimate unavailable';
export const SLEEP_PASSED = 'Usual time has passed.';
export const SLEEP_LOG = 'Log sleep';
export const SLEEP_AROUND = 'Around';
export const SLEEP_TYPICAL = 'Typical';
export const SLEEP_USUAL_WAKE = 'Usual wake-up';
export const SLEEP_MORNING_WAKE = 'Morning wake-up';
export const SLEEP_NEXT_NAP = 'Next nap';
export const SLEEP_BEDTIME = 'Bedtime';
export const SLEEP_MORNING_PATTERN = 'Morning pattern';
export const SLEEP_OUTLOOK_LABEL = 'Outlook';
export const SLEEP_STARTED = 'Started';
export const SLEEP_NAP_LENGTH = 'Nap length';
export const SLEEP_RECENT_NAPS = 'Recent naps';
export const SLEEP_LAST_WOKE = 'Last woke';
export const SLEEP_TIME_AWAKE = 'Time awake';
export const SLEEP_BASED_ON = 'Based on';
export const SLEEP_RECENT_LOGS = 'Recent sleep logs';
export const SLEEP_USUAL_MORNING = 'Usual morning';
export const SLEEP_USUAL_BEDTIME = 'Usual bedtime';
/** A quiet log's next nap, by the household's usual clock time (2026-10-06). */
export const SLEEP_USUAL_NAP = 'Usual nap time';

/**
 * THE WINDOW ON THE CARD (2026-10-08): "Between" over "2:15–2:35 PM", and two rows under the fold
 * that say where it came from and how it has done, as counts of the household's own sleeps.
 */
export const SLEEP_BETWEEN = 'Between';
export const SLEEP_WINDOW = 'Window';
export const SLEEP_IN_WINDOW = 'Began inside it';
export const sleepWindowFrom = (samples: number): string =>
  samples === 0 ? '10 minutes either side for now' : `From the last ${samples} estimates`;
export const sleepInWindow = (caught: number, judged: number): string =>
  `${caught} of the last ${judged}`;

export const sleepAbout = (length: string): string => `About ${length}`;
export const sleepLogged = (n: number): string => `${n} logged`;
export const sleepRecentNights = (n: number): string =>
  n === 1 ? '1 recent night' : `${n} recent nights`;
export const sleepRecentWindows = (n: number): string =>
  n === 1 ? '1 wake window' : `${n} wake windows`;

/** `1 nap today` · `0 naps today`. The usual count for a whole day stays off this line. */
export const napsTodayCount = (n: number): string => `${n} nap${n === 1 ? '' : 's'} today`;

/** The locked card's one line. It says what is behind the gate, never what it would reveal. */
export const NAP_LOCKED = 'Your baby’s nap outlook';
export const NAP_LOCKED_BODY =
  'The stretch between waking and the next sleep, from your own recent entries, and when the next ' +
  'nap or the night would fall if today runs the same way. With the count it came from.';
