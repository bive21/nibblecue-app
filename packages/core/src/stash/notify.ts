/**
 * THE MILK STASH'S ONE REMINDER, PLANNED ON THE PHONE (docs/MILK_STASH.md §14, docs/NOTIFICATIONS.md
 * §10; the owner, 2026-10-07: "for every notification make sure it's been built"). The Reminders
 * page had a Milk stash row since 2026-09-19 and nothing ever rang for it: §10's design is a server
 * sweep that was never built, and the server's push reaches no iPhone. So the phone plans it, from
 * the containers it already holds, the way it plans the day before a vaccine visit.
 *
 * WHAT RINGS. On the day some milk CROSSES one of the guidance file's best-use thresholds
 * (`notifications.bestUseThresholdsDays`, 30, 7 and 0 days before its best-use date), at
 * `STASH_REMINDER_LOCAL_TIME`, one notification for the household's milk — never one per container
 * (`notifications.grouping`). Crossing, not inside: a bag 20 days out is not announced every
 * morning for three weeks, it is announced on the morning it is 30 days out and again at 7. When
 * several thresholds are crossed the same morning, the nearest is the one said. Milk already past
 * its best-use date is not announced again: the Stash tab says it, and the guidance file says the
 * app never declares a container unusable (`display.rule`).
 *
 * The words are the file's `copyTemplate` ("{{oz}} of frozen milk is approaching its best-use
 * date."), with "stored" for a mix that is not all frozen, and the day's own sentence on the day
 * itself. None of `display.neverSay`; `notify.test.ts` holds that.
 */
import { zonedToUtc } from '../today/day';
import {
  addDays,
  calendarDaysBetween,
  isoDateIn,
  parseIsoDate,
  type IsoDate,
} from '../vaccines/date';

/** When the stash reminder rings on its day, on the plan's clock: a daytime hour. */
export const STASH_REMINDER_LOCAL_TIME = '09:00';

export interface StashNotifyContainer {
  bestUseAt: number | null;
  ml: number;
  frozen: boolean;
}

export interface StashCrossing {
  date: IsoDate;
  atMs: number;
  /** The local midnight the day starts at: a reminder deferred past it is not planned. */
  dayStartMs: number;
  /** Days before the best-use date: one of the thresholds. */
  threshold: number;
  ml: number;
  containers: number;
  frozenOnly: boolean;
}

/** Today's and tomorrow's crossing, at most one a day, nearest threshold first. */
export function planStashCrossings(input: {
  containers: readonly StashNotifyContainer[];
  thresholds: readonly number[];
  timeZone: string;
  nowMs: number;
  localTime?: string;
}): StashCrossing[] {
  const [hh, mm] = (input.localTime ?? STASH_REMINDER_LOCAL_TIME).split(':').map(Number);
  const today = isoDateIn(input.timeZone, input.nowMs);
  const nearestFirst = [...new Set(input.thresholds)].filter(t => t >= 0).sort((a, b) => a - b);
  const out: StashCrossing[] = [];
  for (const date of [today, addDays(today, 1)]) {
    const d = parseIsoDate(date);
    const atMs = zonedToUtc(input.timeZone, d.y, d.m, d.d, hh ?? 9, mm ?? 0);
    if (atMs <= input.nowMs) continue;
    for (const threshold of nearestFirst) {
      const crossing = input.containers.filter(
        c =>
          c.ml > 0 &&
          c.bestUseAt !== null &&
          calendarDaysBetween(date, isoDateIn(input.timeZone, c.bestUseAt)) === threshold,
      );
      if (crossing.length === 0) continue;
      out.push({
        date,
        atMs,
        dayStartMs: zonedToUtc(input.timeZone, d.y, d.m, d.d),
        threshold,
        ml: crossing.reduce((sum, c) => sum + c.ml, 0),
        containers: crossing.length,
        frozenOnly: crossing.every(c => c.frozen),
      });
      break;
    }
  }
  return out;
}

/** What the reminder says: the guidance file's template, and the day's own sentence on the day. */
export const STASH_NOTIFY_COPY = {
  title: 'Milk stash',
  body: (amount: string, c: Pick<StashCrossing, 'threshold' | 'frozenOnly'>): string => {
    const milk = c.frozenOnly ? 'frozen milk' : 'stored milk';
    if (c.threshold === 0) return `${amount} of ${milk} reaches its best-use date today.`;
    return `${amount} of ${milk} is approaching its best-use date, in ${c.threshold} days.`;
  },
} as const;
