/**
 * EVERY SENTENCE THE USUAL-WINDOWS CARD CAN WRITE, in one file, so one test can run the report
 * lint over all of them at every sample size.
 *
 * The grammar is deliberately tiny — four forms and nothing else — because the risk here is not a
 * wrong number, it is a well-meant edit. "Bedtime is usually around 7:30" is one word away from
 * "the first sleep of the evening began between 7:10 and 8:25 on 12 of the last 14 days", and the
 * first is a prediction while the second is a count. The forms:
 *
 *   1. THE WINDOW.   `<what> <verb, past tense> between <time> and <time> on <n> of the last
 *                     <days> days.`  Always past tense, always with both numbers.
 *   2. THE CLUSTER.  `<n> of the <N> fell between <time> and <time>.`  The tight half, with the
 *                     exact count inside it rather than the word "half".
 *   3. THE LENGTH.   `Those stretches ran from <duration> to <duration>. The middle one was
 *                     <duration>.`  The only median printed anywhere, and only for a length.
 *   4. THE WAIT.     `<n> of the last <days> days carry <thing>. A window appears once there
 *                     are <needed>.`  What is missing, said as a count.
 *
 * There is no fifth form. In particular there is no sentence naming a direction (earlier, later,
 * longer, shorter), no sentence with the parent as its subject, and no sentence about a day that
 * has not happened. `reportBannedHits` catches the advice and comparison families; the shape of
 * this file is what keeps the tense right, which no word list can check.
 *
 * Units and clock text are built here rather than by the caller because these are TIMES OF DAY,
 * not quantities: there is no household preference to convert to, and a 24-hour household reads
 * the same window on a clock that says 19:10. (The 12/24 preference rides on `clockText` for
 * instants; a window is spoken text, and it stays in the one form the rest of Reports writes —
 * `DashboardCards.hourLabel` uses the same `a.m.` / `p.m.`.)
 */
import { durationLabel } from '../today/since';
import {
  EVENING_FALLBACK_FROM_MINUTE,
  EVENING_FROM_MINUTE,
  MORNING_FROM_MINUTE,
  MORNING_TO_MINUTE,
  NIGHT_FROM_MINUTE,
  NIGHT_TO_MINUTE,
  type UsualCluster,
  type UsualSpan,
  type UsualWindow,
  type UsualWindowId,
  type UsualWindows,
  type UsualWindowWatch,
} from './windows';

const MINUTES_PER_DAY = 1440;
const MIN_MS = 60_000;

const wrap = (minute: number): number =>
  ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/** `6:05 a.m.` — a window past midnight wraps, because 00:40 is what the clock in the room said. */
export function usualWindowClock(minute: number): string {
  const m = wrap(minute);
  const h = Math.floor(m / 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** The same clock, for a boundary rather than an observation: `5 a.m.`, `noon`, `midnight`. */
export function usualHourWord(minute: number): string {
  const m = wrap(minute);
  if (m === 0) return 'midnight';
  if (m === MINUTES_PER_DAY / 2) return 'noon';
  const h = Math.floor(m / 60);
  const h12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? 'a.m.' : 'p.m.';
  return m % 60 === 0 ? `${h12} ${suffix}` : `${h12}:${String(m % 60).padStart(2, '0')} ${suffix}`;
}

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/**
 * A full stop, unless the sentence already ends in one — which it does whenever it ends on a
 * clock time, because `7:20 a.m.` carries its own. English does not double the period there, and
 * `7:20 a.m..` on a card is the kind of small wrongness that makes a parent trust the numbers
 * beside it a little less.
 */
const end = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

/** `between 6:40 a.m. and 8:15 a.m.`, or `at 7:10 a.m.` when every sighting landed on one minute. */
const betweenClock = (span: Pick<UsualSpan, 'from' | 'to'>): string =>
  span.from === span.to
    ? `at ${usualWindowClock(span.from)}`
    : `between ${usualWindowClock(span.from)} and ${usualWindowClock(span.to)}`;

const duration = (minutes: number): string => durationLabel(minutes * MIN_MS);

/* ------------------------------------------------------------------- the words */

export const USUAL_WINDOWS_HEADER = 'Usual windows';

/**
 * WHY THE HEADER IS NOT "YOUR BABY'S USUAL WINDOWS", WHICH IS THE FEATURE'S NAME.
 *
 * The child chip above this screen has an "All" position, and a household with twins reading it
 * is looking at two babies' entries pooled. "Your baby's" would be wrong for them, on the one
 * card whose whole claim is that it only ever says what the log contains. The feature's own name
 * lives where a parent meets it as a name — the paywall's `why` line and the locked card's spoken
 * name (`USUAL_WINDOWS_LOCKED`) — and the card itself says what it is over.
 */
export const usualWindowsLede = (days: number): string =>
  `The last ${days} full ${plural(days, 'day')} of your own log. Today is not counted yet. ` +
  `Every window says how many days it came from.`;

export const usualWindowsEmptyLine = (days: number): string =>
  `Nothing logged in the last ${days} ${plural(days, 'day')} yet.`;

/**
 * The row's value: the tight window as a range, or one time when the days all landed on it.
 *
 * It is the CLUSTER rather than the whole spread, and it is a range rather than a single time on
 * purpose. A row that read `Bedtime · 7:34 p.m.` would be the one shape this feature may never
 * take — a lone clock time under the word "usual" is how a prediction looks — while two times
 * with a dash between them can only be read as "somewhere in here, before now". The sentences
 * underneath carry the spread and both counts.
 */
export const usualWindowValue = (w: UsualWindow): string =>
  w.cluster.from === w.cluster.to
    ? usualWindowClock(w.cluster.from)
    : `${usualWindowClock(w.cluster.from)} – ${usualWindowClock(w.cluster.to)}`;

/** The sample, as a caption under the time: `12 of 14 days`. */
export const usualWindowCount = (w: UsualWindow): string =>
  `${w.samples} of ${w.days} ${plural(w.days, w.id === 'longestNight' ? 'night' : 'day')}`;

/**
 * The night stretch's length, as a figure rather than a sentence. `4h 10m to 6h 20m`, or the one
 * length when every night was the same. Null for a window that has no length.
 */
export function usualLengthValue(w: UsualWindow): string | null {
  const l = w.length;
  if (l === null) return null;
  if (l.from === l.to) return duration(l.from);
  return `${duration(l.from)} to ${duration(l.to)}`;
}

/** The sentences, one tap away, so the card can lead with the times. */
export const USUAL_WINDOWS_COUNTED = 'How these were counted';

/** The row's value while an event is under the minimum — a state, not a dash. */
export const USUAL_WINDOW_WATCHING = 'Still watching';

export const USUAL_WINDOW_LABEL: Record<UsualWindowId, string> = {
  firstFeed: 'The first feed of the day',
  morningNap: 'The morning nap',
  bedtime: 'Bedtime',
  longestNight: 'The longest stretch at night',
};

/** What the wait line counts. A noun phrase, so the sentence reads as a fact about days. */
const WATCH_NOUN: Record<UsualWindowId, string> = {
  firstFeed: 'a feed',
  morningNap: 'a morning nap',
  bedtime: 'an evening sleep',
  longestNight: 'a finished stretch of night sleep',
};

/** Form 1, per event. The verb differs because the events differ; the shape never does. */
const WINDOW_SENTENCE: Record<UsualWindowId, (where: string, n: number, days: number) => string> = {
  firstFeed: (where, n, days) =>
    `The first feed was logged ${where} on ${n} of the last ${days} ${plural(days, 'day')}`,
  morningNap: (where, n, days) =>
    `A morning nap started ${where} on ${n} of the last ${days} ${plural(days, 'day')}`,
  bedtime: (where, n, days) =>
    `The first sleep of the evening began ${where} on ${n} of the last ${days} ${plural(days, 'day')}`,
  longestNight: (where, n, days) =>
    `The longest stretch of night sleep began ${where} on ${n} of the last ${days} ${plural(days, 'night')}`,
};

/** Form 1. */
export const usualWindowLine = (w: UsualWindow): string =>
  end(WINDOW_SENTENCE[w.id](betweenClock(w.clock), w.samples, w.days));

/**
 * Form 2 — omitted when the cluster is the whole spread, because then it is form 1 again with
 * different words, and a card that says the same thing twice is a card a parent stops reading.
 */
export function usualClusterLine(w: UsualWindow): string | null {
  const c: UsualCluster = w.cluster;
  if (c.count >= w.samples) return null;
  return end(`${c.count} of the ${w.samples} fell ${betweenClock(c)}`);
}

/** Form 3 — the night stretch only, and the only place a median is spoken. */
export function usualLengthLine(w: UsualWindow): string | null {
  const l = w.length;
  if (l === null) return null;
  if (l.from === l.to) return end(`Those stretches were all ${duration(l.from)}`);
  return (
    end(`Those stretches ran from ${duration(l.from)} to ${duration(l.to)}`) +
    end(` The middle one was ${duration(l.median)}`)
  );
}

/** Form 4. */
export const usualWatchLine = (w: UsualWindowWatch): string =>
  end(`${w.samples} of the last ${w.days} ${plural(w.days, 'day')} carry ${WATCH_NOUN[w.id]}`) +
  end(` A window appears once there are ${w.needed}`);

/**
 * The line that stops "on 10 of the last 14 days" from being read as "the baby skipped four".
 *
 * A day with nothing logged at all is a day about the parent, not about the baby — the same
 * distinction `stool/pattern.ts` draws with `confident`, and the same reason: the row count alone
 * cannot tell the two apart, so the card says which it is looking at.
 */
export function usualBlankDaysLine(w: UsualWindows): string | null {
  const blank = w.days - w.loggedDays;
  if (blank <= 0) return null;
  return end(`${blank} of those ${w.days} ${plural(w.days, 'day')} have nothing logged at all`);
}

/**
 * The boundaries the app chose, printed, and built from the constants so the sentence cannot
 * drift from the arithmetic. A parent who would not call a 5:30 a.m. sleep a morning nap can see
 * that the app does, instead of wondering where the number came from.
 */
export const USUAL_WINDOWS_METHOD =
  end(
    `A morning nap is a sleep between ${usualHourWord(MORNING_FROM_MINUTE)} and ${usualHourWord(MORNING_TO_MINUTE)} that was not marked as night sleep`,
  ) +
  end(
    ` Bedtime is the first sleep marked as night from ${usualHourWord(EVENING_FROM_MINUTE)}, or the first sleep from ${usualHourWord(EVENING_FALLBACK_FROM_MINUTE)} when none was marked`,
  ) +
  end(
    ` A night stretch is the longest finished sleep that began between ${usualHourWord(NIGHT_FROM_MINUTE)} and ${usualHourWord(NIGHT_TO_MINUTE)}`,
  );

/** The last line on the card, and the one that says what the card is not. */
export const USUAL_WINDOWS_FOOTER =
  'Counted from your own entries. Nothing here says what comes next.';

/* ------------------------------------------------------------------ the gate */

/**
 * What a household without Plus meets. The card still draws each window's shape in its place on
 * the day — CLAUDE.md §4, "every gate shows what is behind it" — and withholds the times.
 *
 * The name is the locked card's SPOKEN name, and the sentence under it is what the card draws.
 * Drawn, the name sat straight under the header "Usual windows" and said it again (2026-09-29).
 */
export const USUAL_WINDOWS_LOCKED = 'Your baby’s usual windows';

export const usualWindowsLockedBody = (days: number): string =>
  `The windows your baby has actually fed and slept in over the last ${days} ${plural(days, 'day')}, each with the number of days it was counted from.`;

/* ------------------------------------------------------------------ the lint */

/** Every string this file can produce for one result — what the banned-phrase test runs over. */
export function allUsualWindowLines(w: UsualWindows): string[] {
  const out: string[] = [
    USUAL_WINDOWS_HEADER,
    USUAL_WINDOWS_COUNTED,
    usualWindowsLede(w.days),
    usualWindowsEmptyLine(w.days),
    USUAL_WINDOW_WATCHING,
    USUAL_WINDOWS_METHOD,
    USUAL_WINDOWS_FOOTER,
    USUAL_WINDOWS_LOCKED,
    usualWindowsLockedBody(w.days),
    ...Object.values(USUAL_WINDOW_LABEL),
  ];
  const blank = usualBlankDaysLine(w);
  if (blank !== null) out.push(blank);
  for (const win of w.windows) {
    out.push(usualWindowValue(win));
    out.push(usualWindowCount(win));
    const lengthValue = usualLengthValue(win);
    if (lengthValue !== null) out.push(lengthValue);
    out.push(usualWindowLine(win));
    const cluster = usualClusterLine(win);
    if (cluster !== null) out.push(cluster);
    const length = usualLengthLine(win);
    if (length !== null) out.push(length);
  }
  for (const watch of w.watching) out.push(usualWatchLine(watch));
  return out;
}
