/**
 * THE DAY BEFORE A VISIT THE PARENT PLANNED (2026-09-28). The owner asked for the app to be one a
 * family keeps for months, and the pediatrician visit is the moment the visit summary exists for:
 * a date the app already knows, because the parent put it on the Vaccines page. Until now the
 * summary was reachable from Reports alone, and the only visit reminders were the server's (14 and
 * 2 days out, `reminders.ts`), which reach no iPhone at all and an Android phone only once the
 * server's push is switched on. This file is the phone's own reminder: once, the day before.
 *
 * Pure: which planned visits get one, when it rings, what it says and where a tap on it goes. Who
 * hears it and how — parents only, their Vaccines level, their quiet hours — is the phone's plan
 * (`apps/mobile/src/notifications/plan.ts`), with the same rules as every other reminder there.
 *
 * A PLANNED VISIT IS A DATE THE PARENT SET: a `PLANNED` record, a dose or a whole visit on the
 * Vaccines page, or a vaccine they added and planned. Nothing else. A published window opening is
 * not an appointment, so it never hears "Visit tomorrow"; that sentence is only true of a day
 * somebody booked.
 *
 * WHAT IT MAY SAY is less than any other vaccine sentence (docs/VACCINES.md §1): the day, the
 * baby's name, and that the summary (or the record) is ready to show. Never a vaccine, never a
 * count of doses, never "due", never a dash. `visitEve.test.ts` runs every variant through
 * `bannedHits` and the words a reminder may not use.
 */
import { zonedToUtc } from '../today/day';
import {
  addDays,
  calendarDaysBetween,
  compareIsoDates,
  isIsoDate,
  isoDateIn,
  parseIsoDate,
  type IsoDate,
} from './date';
import { VISIT_REMINDER_LOCAL_TIME } from './reminders';
import { SOON_DAYS } from './soon';

/**
 * WHEN IT RINGS: the day before, at the visit reminders' own daytime hour (§9: 09:00, "a product
 * setting, not guidance"). Morning rather than evening, so there is a whole day to find the record
 * card or print the sheet, and never at night.
 */
export const VISIT_EVE_LOCAL_TIME = VISIT_REMINDER_LOCAL_TIME;

/**
 * AT MOST THIS MANY ON A PHONE AT ONCE, the nearest first. A household rarely has more than one
 * planned visit ahead of it, the plan is worked out again every time the app opens, and iOS keeps
 * 64 pending notifications for the whole app, which the schedule's own reminders need first.
 */
export const VISIT_EVE_MAX = 2;

/**
 * WHERE A TAP GOES: this path of the app's deep-link table (`apps/mobile/src/app/linking.ts`), which
 * opens the visit summary for the baby it names, or the Vaccines page when the household's plan
 * does not include the summary. The scheme is the app's to add (it lives in brand.json).
 */
export const VISIT_SUMMARY_PATH = 'vaccines/summary';

export const visitSummaryPath = (childId: string): string =>
  `${VISIT_SUMMARY_PATH}?child=${encodeURIComponent(childId)}`;

/** One baby's planned visit day, as the Vaccines page reads the records. */
export interface PlannedVisitDay {
  childId: string;
  childName: string;
  date: IsoDate;
}

/**
 * THE PLANNED DATES FROM TODAY ON, earliest first, each once. A visit is one date however many
 * doses the parent planned for it, and a date that has passed is a record, not an appointment.
 */
export function upcomingPlannedDates(
  dates: readonly (IsoDate | null | undefined)[],
  today: IsoDate,
): IsoDate[] {
  const out = new Set<IsoDate>();
  for (const d of dates) {
    if (typeof d !== 'string' || !isIsoDate(d)) continue;
    if (compareIsoDates(d, today) >= 0) out.add(d);
  }
  return [...out].sort(compareIsoDates);
}

/**
 * THE PLANNED VISIT A SUMMARY IS FOR: the nearest planned date from today to `withinDays` ahead,
 * both ends included — the owner's week (`SOON_DAYS`, the same week a vaccine chip turns red in),
 * so the row that offers the summary and the red chip beside it appear together. Null outside it.
 */
export function plannedVisitWithin(
  dates: readonly (IsoDate | null | undefined)[],
  today: IsoDate,
  withinDays: number = SOON_DAYS,
): IsoDate | null {
  for (const d of upcomingPlannedDates(dates, today)) {
    const days = calendarDaysBetween(today, d);
    if (days >= 0 && days <= withinDays) return d;
  }
  return null;
}

/** The instant the day before `date` reads `localTime` in `timeZone`. */
export function visitEveAt(
  date: IsoDate,
  timeZone: string,
  localTime: string = VISIT_EVE_LOCAL_TIME,
): number {
  const [hh, mm] = localTime.split(':').map(Number);
  const eve = parseIsoDate(addDays(date, -1));
  return zonedToUtc(timeZone, eve.y, eve.m, eve.d, hh ?? 9, mm ?? 0);
}

/** What a tap opens, which is also what the words promise. */
export type VisitEveOpens = 'summary' | 'record';

export interface VisitEve {
  /** The visit day, `yyyy-mm-dd`, in the zone the phone reads in. */
  date: IsoDate;
  /** Every baby with a visit planned that day, in the order given; one notification for all. */
  childIds: string[];
  /** When it rings, before quiet hours: the day before the visit, at `localTime`. */
  atMs: number;
  /**
   * The visit day's first instant. From then on "tomorrow" is false, so a reminder quiet hours
   * would push past it is not sent at all (the plan's decision).
   */
  dayStartMs: number;
  opens: VisitEveOpens;
  title: string;
  body: string;
  /** The deep-link path a tap opens, for the first baby named. */
  path: string;
}

export interface VisitEveInput {
  /** Every baby's planned visit days. The same baby and day twice is one visit. */
  visits: readonly PlannedVisitDay[];
  timeZone: string;
  nowMs: number;
  /**
   * Whether the household's plan includes the visit summary (`reports`). A tap then opens it and
   * the words say so; without it the tap opens the Vaccines page and the words say that instead.
   * A reminder never advertises what its tap cannot open.
   */
  summary: boolean;
  localTime?: string;
  max?: number;
}

/**
 * THE VISIT REMINDERS A PHONE MAY PUT ON ITSELF, nearest first: one per visit day, naming every
 * baby planned for it, for every day after today. A visit today has had its day before; one planned
 * for tomorrow after 9:00 this morning is still returned, with its moment already gone, so the plan
 * can keep a reminder that has rung in the shade until the visit day and never schedule one that
 * has not (it would ring at once, for a visit the parent has just planned).
 */
export function planVisitEves(input: VisitEveInput): VisitEve[] {
  const localTime = input.localTime ?? VISIT_EVE_LOCAL_TIME;
  const max = input.max ?? VISIT_EVE_MAX;
  const today = isoDateIn(input.timeZone, input.nowMs);
  const byDate = new Map<IsoDate, { ids: string[]; names: string[] }>();
  for (const v of input.visits) {
    if (!isIsoDate(v.date) || compareIsoDates(v.date, today) <= 0) continue;
    const day = byDate.get(v.date) ?? { ids: [], names: [] };
    if (!day.ids.includes(v.childId)) {
      day.ids.push(v.childId);
      day.names.push(v.childName.trim());
    }
    byDate.set(v.date, day);
  }
  const out: VisitEve[] = [];
  for (const date of [...byDate.keys()].sort(compareIsoDates)) {
    if (out.length >= max) break;
    const day = byDate.get(date);
    const first = day?.ids[0];
    if (day === undefined || first === undefined) continue;
    const d = parseIsoDate(date);
    const opens: VisitEveOpens = input.summary ? 'summary' : 'record';
    out.push({
      date,
      childIds: [...day.ids],
      atMs: visitEveAt(date, input.timeZone, localTime),
      dayStartMs: zonedToUtc(input.timeZone, d.y, d.m, d.d),
      opens,
      title: VISIT_EVE_COPY.title(day.names),
      body:
        opens === 'summary'
          ? VISIT_EVE_COPY.summary(day.ids.length)
          : VISIT_EVE_COPY.record(day.ids.length),
      path: visitSummaryPath(first),
    });
  }
  return out;
}

/** `Emma`, `Emma and Liam`, `Emma, Liam and Noah`. */
const namesLine = (names: readonly string[]): string => {
  const named = names.filter(n => n !== '');
  if (named.length <= 1) return named[0] ?? '';
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1] ?? ''}`;
};

/**
 * THE WORDS, and every one of them is a fact the parent gave the app: the day they planned, whose
 * visit it is, and that what they will show is ready. Sentence case, no dash, no dose, no "due".
 */
export const VISIT_EVE_COPY = {
  title: (names: readonly string[]): string => {
    const who = namesLine(names);
    return who === '' ? 'Visit tomorrow' : `Visit tomorrow for ${who}`;
  },
  /** With the summary in the plan: the tap opens it. */
  summary: (babies: number): string =>
    babies > 1 ? 'Your summaries are ready to show.' : 'Your summary is ready to show.',
  /**
   * Without it: the tap opens the Vaccines page, the record a parent (or a grandparent) shows at a
   * visit (docs/VACCINES.md §7). Nothing about what Plus would add: a reminder is not a sales pitch.
   */
  record: (babies: number): string =>
    babies > 1 ? 'The vaccine records are ready to show.' : 'The vaccine record is ready to show.',
} as const;
