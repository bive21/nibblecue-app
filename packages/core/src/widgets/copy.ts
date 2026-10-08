/**
 * Every sentence a widget shows. Held here, not in the layouts, so `copy.test.ts` can read them
 * as data and hold each to the banned list — and because a layout function is stringified into
 * the widget extension (docs/WIDGETS.md §1) and cannot reach a constant outside itself: the app
 * puts these words INTO the snapshot, and the layout only places them.
 *
 * Sentence case, plain, never clinical, US English. A parent at 3 a.m. reads these at arm's length.
 */
export const WIDGET_COPY = {
  last: 'Last',
  lastFeed: 'Last feed',
  lastDiaper: 'Last diaper',
  next: 'Next',
  nothingPlanned: 'Nothing planned',
  dueNow: 'Due now',
  asleep: 'Asleep',
  awake: 'Awake',
  since: 'since',
  today: 'Today',
  feeds: 'feeds',
  diapers: 'diapers',
  sleep: 'sleep',
  solids: 'solids',
  pumpedToday: 'Pumped today',
  sessions: 'sessions',
  stash: 'Stash',
  useFirst: 'Use first',
  stop: 'Stop',
  started: 'started',
  stale: 'Open the app to refresh',
  quickLog: 'Quick log',
  /** "Since 1:40 PM" — the status panel's second line, under Asleep or Awake. */
  sinceAt: 'Since',
  /** "Started 1:40 PM" — the same line under a running feed or playtime. */
  startedAt: 'Started',
  nextUp: 'Next up',
  /** A feed on pause, where its clock would be. */
  paused: 'Paused',
  /** A timer the lock screen's least privacy may only say exists ("Just the basics"). */
  timerRunning: 'Timer running',
  /** The Timer widget with nothing running and no sleep to count from. */
  noTimer: 'No timer running',
  yourPumping: 'Your pumping',
  /** What a screen reader says of a blank widget: nothing about the household (`blank`). */
  unavailable: 'Widget unavailable',
  noEntryYet: 'None yet',
} as const;

/** "4 mo 12 d" from an age in days — the widget's own short form, no words a parent must read. */
export function shortAge(days: number): string {
  if (days < 0) return '';
  if (days < 30) return `${days} d`;
  let months = Math.floor(days / 30.4375);
  let rest = Math.round(days - months * 30.4375);
  if (rest >= 30) {
    months += 1;
    rest = 0;
  }
  if (months < 24) return rest > 0 ? `${months} mo ${rest} d` : `${months} mo`;
  const years = Math.floor(months / 12);
  const m = months - years * 12;
  return m > 0 ? `${years} y ${m} mo` : `${years} y`;
}

/** Pluralised count line for the totals strip: "3 feeds", "1 diaper". */
export function countLabel(n: number, word: string): string {
  return `${n} ${n === 1 ? word.replace(/s$/, '') : word}`;
}
