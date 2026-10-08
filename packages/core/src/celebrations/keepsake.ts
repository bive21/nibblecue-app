/**
 * THE FIRST YEAR, KEPT (the owner, 2026-09-28: *"a year-one keepsake (Plus)"*;
 * docs/GROWTH_AND_RETENTION.md §3 and §8 item 5; docs/CELEBRATIONS.md §9).
 *
 * A document of a baby's first year made from the household's own log: what was logged, added up,
 * with the sample size beside every figure (CLAUDE.md §2 rule 6), and the twelve monthly notes'
 * figures as a table. It makes the monthly note's promise over a year: the date and the household's
 * own numbers, nothing about development, no comparison with anyone, no verdict on any number and
 * no praise for one. `keepsake.test.ts` runs `celebrationBannedHits` and Reports' verdict list over
 * every word it can say.
 *
 * PURE, AND DATA. Like the visit summary (`reports/visitSheet.ts`) the output is rows and a table,
 * not a page: the screen draws it, `keepsakeHtml` prints it through the same `printableDocument`
 * the visit summary uses, and the two cannot drift. The words for amounts are the caller's
 * (`KeepsakeFormat`: the household's own ounces or millilitres, its own scale for a weight),
 * because core knows no unit a person reads (CLAUDE.md §6).
 *
 * THE YEAR is the birth date to the first birthday, both days in: the twelve monthly notes'
 * windows (`monthWindow`) laid end to end, and they tile, so the table's twelve rows add up to the
 * year above them. A household that started logging later is not credited with months it never
 * logged: the header names the first entry, the days with entries are counted from it, and the
 * table starts at the month that holds it.
 *
 * THE MONTHS ARE WORKED OUT FROM THE LOG, NOT READ FROM THE NOTES THE PHONE HOLDS. A note's
 * figures are frozen on the phone that showed it (`apps/mobile/src/celebrations/store.ts`, on the
 * phone alone): the other parent's phone holds its own set, a replaced phone holds none, and a
 * month nobody opened Today in was never claimed at all. The log is the household's, on every
 * phone. The windows and the instrument are the notes' own (`celebrationFigures`), so a month's
 * row says what its note said, unless an entry in that month was added or corrected since, when
 * the keepsake is the truer of the two.
 *
 * NO PERCENTILES, NO RATES, NO CHANGES. A measurement is said as it was entered, the first and the
 * latest, each with its date; the difference of two, and a rate of it, is the growth chart's
 * question, which is the pediatrician's (CLAUDE.md §2 rules 1 and 3). The vaccines are a count of
 * doses the household marked given; nothing is said about any that were not.
 *
 * No product name is in it (docs/BRANDING.md §2): a keepsake of somebody's own baby is about them.
 */
import type { VolumeUnit } from '../entry/units';
import type { PrintableTable } from '../reports/printable';
import { printableDocument } from '../reports/printable';
import type { GrowthMetric } from '../reports/insights';
import { growthInsight } from '../reports/insights';
import type { ReportRange } from '../reports/range';
import type { VisitRow, VisitSection } from '../reports/visitSheet';
import { foodReport, mealEntriesFrom, type MealEntry } from '../solids/history';
import { localDayKey, zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import { countsAsDiaper, recordedMs } from '../today/totals';
import {
  addMonthsClamped,
  celebrationFigures,
  celebrationMarks,
  celebrationPerDay,
  markLabel,
  monthWindow,
  type CelebrationFigures,
  type CelebrationMark,
} from './index';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The month a keepsake is made at: the first birthday, the twelfth mark. */
export const KEEPSAKE_MONTHS = 12;

/* ------------------------------------------------------------------ when it is ready */

/**
 * THE DAY A CHILD'S KEEPSAKE IS READY: the first birthday, clamped as every mark is
 * (`addMonthsClamped`), so a baby born on 29 February has one on 28 February. Null for a birth
 * date that does not parse, which has no birthday to wait for.
 */
export function keepsakeReadyOn(birthIso: string): string | null {
  return ISO_DAY.test(birthIso) ? addMonthsClamped(birthIso, KEEPSAKE_MONTHS) : null;
}

/** Whether the keepsake is ready on `todayIso`, the household's own calendar day. */
export function keepsakeReady(birthIso: string, todayIso: string): boolean {
  const on = keepsakeReadyOn(birthIso);
  return on !== null && todayIso >= on;
}

/** The first twelve marks, the first birthday last: the months the year is made of. */
const yearMarks = (birthIso: string): CelebrationMark[] =>
  celebrationMarks(birthIso).filter(m => m.monthNumber <= KEEPSAKE_MONTHS);

/**
 * THE YEAR, as a window: the first month's start to the twelfth month's end, never past the end of
 * today (`monthWindow` holds that for each month), so a keepsake made on the birthday itself counts
 * the birthday so far.
 */
export function keepsakeYear(birthIso: string, timeZone: string, nowMs: number): ReportRange {
  const months = yearMarks(birthIso).map(m => monthWindow(m, birthIso, timeZone, nowMs));
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) {
    return { key: 'custom', fromMs: nowMs, toMs: nowMs, days: 1 };
  }
  return {
    key: 'custom',
    fromMs: first.fromMs,
    toMs: Math.max(first.fromMs, last.toMs),
    days: months.reduce((sum, w) => sum + (w.toMs > w.fromMs ? w.days : 0), 0) || 1,
  };
}

/* ------------------------------------------------------------------ the words */

/** How the numbers are written, in the household's own units and zone: the caller's. */
export interface KeepsakeFormat {
  /** ml → the household's own unit, `4 oz`. */
  volume: (ml: number) => string;
  /** minutes → `1h 35m`. */
  duration: (minutes: number) => string;
  /** canonical grams or millimetres → the household's own scale, `9 lb 2 oz`, `74.5 cm`. */
  growth: (metric: GrowthMetric, value: number) => string;
  /** an instant → `Jun 3, 2026`, in the household's own zone. */
  date: (ms: number) => string;
  /** an instant → `Tue, Jun 3, 9:40 PM`, in the household's own zone. */
  stamp: (ms: number) => string;
}

export const KEEPSAKE_CAVEAT =
  'This is what this household logged in the first year, added up. Gaps mean nothing was ' +
  'logged, which is not the same as nothing happening. Nothing here has been interpreted or ' +
  'compared to any guideline.';

export const KEEPSAKE_MONTHS_TITLE = 'Month by month';

export const KEEPSAKE_MONTHS_NOTE =
  'Each month runs from the day after one month mark to the next, the first from the day of ' +
  'birth, as the monthly notes do. Daily figures are across the days with entries. An empty ' +
  'cell means nothing of that kind was logged that month.';

/** The keepsake's title: "Ada’s first year". The name is data and never appears in this file. */
export const keepsakeTitle = (childName: string): string =>
  childName.trim() === '' ? 'The first year' : `${childName.trim()}’s first year`;

/** `1,204`: a year's counts run into the thousands, and a person reads them grouped. */
const grouped = (n: number): string => Math.round(n).toLocaleString('en-US');

const one = (n: number, singular: string, plural = `${singular}s`): string =>
  `${grouped(n)} ${Math.round(n) === 1 ? singular : plural}`;

/**
 * A YEAR'S TOTAL OF TIME: whole hours past a hundred of them (`4,312 hours`), where the minutes
 * are a rounding nobody reads; the household's own `1h 35m` below that.
 */
const longDuration = (minutes: number, fmt: KeepsakeFormat): string =>
  minutes >= 100 * 60 ? `${grouped(minutes / 60)} hours` : fmt.duration(Math.round(minutes));

/** A per-day count as the monthly note writes it: one decimal where there is one (`5.3`, `6`). */
const perDayCount = (n: number): string => String(Math.round(n * 10) / 10);

/* ------------------------------------------------------------------ the model */

export interface KeepsakeInput {
  childName: string;
  /** `yyyy-mm-dd`, as stored. */
  birthDate: string;
  timeZone: string;
  nowMs: number;
  /**
   * This child's entries from the day of birth on, with the household's own that belong to no
   * child (pumping). More than the year is fine: the year is cut here.
   */
  rows: readonly TodayActivity[];
  /** Every meal this child has had, for "first eaten"; read from `rows` when not given. */
  meals?: readonly MealEntry[];
  /** The date (`yyyy-mm-dd`) of each dose this child's vaccine list holds as given. */
  vaccinesGiven: readonly string[];
  /** The household's milk unit: each volume is added up as it reads in it (`volumeAsRead`). */
  unit?: VolumeUnit;
  fmt: KeepsakeFormat;
}

/** One month of the table: its mark, its window's figures, and the per-day ones. */
export interface KeepsakeMonth {
  mark: CelebrationMark;
  figures: CelebrationFigures;
}

export interface YearKeepsake {
  title: string;
  /** The child, the year, where the log starts, how many days have entries, when it was made. */
  header: VisitRow[];
  /** Feeds, diapers, sleep, pumping, solids, growth and vaccines: only the ones with something in them. */
  sections: VisitSection[];
  /** The twelve monthly notes' figures, from the first month with an entry; null with none. */
  months: PrintableTable | null;
  caveat: string;
  /** Nothing at all was logged in the year: the screen says so rather than drawing a page of nothing. */
  empty: boolean;
}

/** The month table's columns after the month and its days: each drawn only if some month has it. */
const MONTH_COLUMNS: readonly {
  title: string;
  has: (f: CelebrationFigures) => boolean;
  cell: (f: CelebrationFigures, fmt: KeepsakeFormat) => string;
}[] = [
  { title: 'Milk', has: f => f.milkMl > 0, cell: (f, fmt) => fmt.volume(f.milkMl) },
  { title: 'Breastfeeds', has: f => f.breastfeeds > 0, cell: f => grouped(f.breastfeeds) },
  {
    title: 'Sleep a day',
    has: f => f.sleepMinutes > 0,
    cell: (f, fmt) => fmt.duration(Math.round(celebrationPerDay(f).sleepMinutes)),
  },
  {
    title: 'Longest stretch',
    has: f => f.longestSleepMinutes > 0,
    cell: (f, fmt) => fmt.duration(f.longestSleepMinutes),
  },
  {
    title: 'Diapers a day',
    has: f => f.diapers > 0,
    cell: f => perDayCount(celebrationPerDay(f).diapers),
  },
  { title: 'Pumped', has: f => f.pumpedMl > 0, cell: (f, fmt) => fmt.volume(f.pumpedMl) },
];

const GROWTH_LABELS: Readonly<
  Record<GrowthMetric, { first: string; latest: string; one: string }>
> = {
  weight: { first: 'First weight', latest: 'Latest weight', one: 'Weight' },
  length: { first: 'First length', latest: 'Latest length', one: 'Length' },
  head: {
    first: 'First head measurement',
    latest: 'Latest head measurement',
    one: 'Head measurement',
  },
};

/** Whole calendar days from one `yyyy-mm-dd` to another, both in. */
const daysBetweenIso = (fromIso: string, toIso: string): number => {
  const at = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(toIso) - at(fromIso)) / DAY) + 1;
};

/**
 * THE KEEPSAKE, from the household's own log. Every number is a count, a sum, a quotient over the
 * days with entries or the longest of something, over entries the household typed, and each says
 * what it was made of.
 */
export function yearKeepsake(input: KeepsakeInput): YearKeepsake {
  const { fmt, timeZone, nowMs, birthDate, unit } = input;
  const year = keepsakeYear(birthDate, timeZone, nowMs);
  const rows = input.rows.filter(r => r.startMs >= year.fromMs && r.startMs < year.toMs);
  const f = celebrationFigures(rows, year, timeZone, unit);
  /** A calendar day's noon where the household is: the instant its date is written from. */
  const noonOf = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return zonedToUtc(timeZone, y, m, d, 12);
  };
  const birthIso = localDayKey(timeZone, year.fromMs);
  const lastIso = localDayKey(timeZone, year.toMs - 1);
  const firstEntryMs = rows.reduce<number | null>(
    (min, r) => (min === null || r.startMs < min ? r.startMs : min),
    null,
  );
  const firstIso = firstEntryMs === null ? null : localDayKey(timeZone, firstEntryMs);
  const lateStart = firstIso !== null && firstIso > birthIso;

  /* ---------------------------------------------------------------- the header */
  const header: VisitRow[] = [
    { label: 'Child', value: input.childName.trim() === '' ? 'Your baby' : input.childName.trim() },
    { label: 'Born', value: fmt.date(noonOf(birthIso)) },
    { label: 'The year', value: `${fmt.date(noonOf(birthIso))} to ${fmt.date(noonOf(lastIso))}` },
    ...(lateStart && firstEntryMs !== null
      ? [{ label: 'First entry', value: fmt.date(firstEntryMs) }]
      : []),
    {
      label: 'Days with entries',
      value: grouped(f.loggedDays),
      note: `of ${one(daysBetweenIso(lateStart && firstIso !== null ? firstIso : birthIso, lastIso), 'day')}${lateStart ? ' from the first entry' : ''}`,
    },
    { label: 'Prepared', value: fmt.stamp(nowMs) },
  ];

  /* ---------------------------------------------------------------- feeds */
  const feeds: VisitRow[] = [];
  if (f.bottles > 0) {
    feeds.push(
      { label: 'Bottles of milk', value: grouped(f.bottles) },
      {
        label: 'Milk from bottles',
        value: fmt.volume(f.milkMl),
        note: `over ${one(f.bottles, 'bottle')}`,
      },
    );
  }
  if (f.breastfeeds > 0) {
    feeds.push({ label: 'Breastfeeds', value: grouped(f.breastfeeds) });
    if (f.breastfeedMinutes > 0) {
      feeds.push({
        label: 'Time at the breast',
        value: longDuration(f.breastfeedMinutes, fmt),
        note: `over ${one(f.breastfeeds, 'breastfeed')}`,
      });
    }
  }

  /* ---------------------------------------------------------------- diapers */
  const changes = rows.filter(countsAsDiaper);
  const kinds = [
    ['wet', changes.filter(r => r.diaperKind === 'WET').length],
    ['dirty', changes.filter(r => r.diaperKind === 'DIRTY').length],
    ['both', changes.filter(r => r.diaperKind === 'BOTH').length],
  ] as const;
  const kindNote = kinds
    .filter(([, n]) => n > 0)
    .map(([word, n]) => `${grouped(n)} ${word}`)
    .join(' · ');
  // "Changes", under the section's own "Diapers": the row said "Diapers" again (2026-09-29)
  const diapers: VisitRow[] =
    f.diapers > 0
      ? [{ label: 'Changes', value: grouped(f.diapers), ...(kindNote ? { note: kindNote } : {}) }]
      : [];

  /* ---------------------------------------------------------------- sleep */
  const sleepRows: VisitRow[] = [];
  if (f.sleepMinutes > 0) {
    const longest = rows
      .filter(r => r.type === 'sleep')
      .reduce<TodayActivity | null>(
        (best, r) => (best === null || recordedMs(r) > recordedMs(best) ? r : best),
        null,
      );
    sleepRows.push(
      {
        label: 'Sleep logged',
        value: longDuration(f.sleepMinutes, fmt),
        note: `over ${one(f.sleeps, 'sleep')}`,
      },
      {
        label: 'Longest stretch',
        value: fmt.duration(f.longestSleepMinutes),
        ...(longest === null ? {} : { note: `began ${fmt.stamp(longest.startMs)}` }),
      },
    );
  }

  /* ---------------------------------------------------------------- pumping */
  const pumping: VisitRow[] =
    f.pumpedMl > 0
      ? [
          {
            label: 'Pumped',
            value: fmt.volume(f.pumpedMl),
            note: `over ${one(f.pumpSessions, 'session')}`,
          },
        ]
      : [];

  /* ---------------------------------------------------------------- solids */
  /*
    EVERY FOOD, NAMED. The visit summary names twelve and counts the rest, because a clinician reads
    it in ninety seconds; a keepsake is read for the list itself, so no food is cut from it. They
    run in the order they were first eaten, each with its day, and nothing marks one: no allergen
    list, no rating, no "watch for" (docs/SOLIDS.md §5).
  */
  const meals = input.meals ?? mealEntriesFrom(input.rows);
  const fr = foodReport(meals, year.fromMs, year.toMs);
  const solids: VisitRow[] = [];
  if (fr.meals > 0) {
    solids.push(
      { label: 'Meals', value: grouped(fr.meals) },
      { label: 'Foods tried', value: grouped(fr.foods.length) },
      ...[...fr.foods]
        .sort((a, b) => a.firstEverMs - b.firstEverMs || a.name.localeCompare(b.name))
        .map(food => ({
          label: food.name,
          value: `first eaten ${fmt.date(food.firstEverMs)}`,
          note: one(food.times, 'time'),
          sub: true as const,
        })),
    );
  }

  /* ---------------------------------------------------------------- growth */
  const growth: VisitRow[] = (['weight', 'length', 'head'] as const).flatMap(metric => {
    const g = growthInsight(rows, metric);
    if (g === null) return [];
    const words = GROWTH_LABELS[metric];
    if (g.points.length === 1) {
      return [
        {
          label: words.one,
          value: fmt.growth(metric, g.first.value),
          note: `${fmt.date(g.first.atMs)} · 1 measurement`,
        },
      ];
    }
    return [
      {
        label: words.first,
        value: fmt.growth(metric, g.first.value),
        note: fmt.date(g.first.atMs),
      },
      {
        label: words.latest,
        value: fmt.growth(metric, g.last.value),
        note: `${fmt.date(g.last.atMs)} · ${one(g.points.length, 'measurement')}`,
      },
    ];
  });

  /* ---------------------------------------------------------------- vaccines */
  const doses = input.vaccinesGiven.filter(
    iso => ISO_DAY.test(iso) && iso >= birthIso && iso <= lastIso,
  ).length;
  const vaccines: VisitRow[] =
    doses > 0
      ? [{ label: 'Vaccine doses', value: grouped(doses), note: 'marked given in the first year' }]
      : [];

  const sections: VisitSection[] = [
    { key: 'feeds', title: 'Feeds', rows: feeds },
    { key: 'diapers', title: 'Diapers', rows: diapers },
    { key: 'sleep', title: 'Sleep', rows: sleepRows },
    { key: 'pumping', title: 'Pumping', rows: pumping },
    { key: 'solids', title: 'Solids', rows: solids },
    { key: 'growth', title: 'Growth', rows: growth },
    { key: 'vaccines', title: 'Vaccines', rows: vaccines },
  ].filter(s => s.rows.length > 0);

  /* ---------------------------------------------------------------- the months */
  const months = keepsakeMonths(input.rows, birthDate, timeZone, nowMs, unit).filter(
    m =>
      firstEntryMs !== null && monthWindow(m.mark, birthDate, timeZone, nowMs).toMs > firstEntryMs,
  );
  const columns = MONTH_COLUMNS.filter(c => months.some(m => c.has(m.figures)));
  const table: PrintableTable | null =
    months.length === 0
      ? null
      : {
          title: KEEPSAKE_MONTHS_TITLE,
          columns: ['Month', 'Days with entries', ...columns.map(c => c.title)],
          rows: months.map(m => {
            return {
              label: markLabel(m.mark),
              note: fmt.date(noonOf(m.mark.onIso)),
              cells: [
                `${grouped(m.figures.loggedDays)} of ${grouped(m.figures.calendarDays)}`,
                ...columns.map(c => (c.has(m.figures) ? c.cell(m.figures, fmt) : '')),
              ],
            };
          }),
          note: KEEPSAKE_MONTHS_NOTE,
        };

  return {
    title: keepsakeTitle(input.childName),
    header,
    sections,
    months: table,
    caveat: KEEPSAKE_CAVEAT,
    empty: rows.length === 0,
  };
}

/**
 * The twelve months as the monthly notes measure them: each mark's window (`monthWindow`) and its
 * figures (`celebrationFigures`), the first month first. Exported so a test can hold the months to
 * the year: they tile, so they add up to it.
 */
export function keepsakeMonths(
  rows: readonly TodayActivity[],
  birthIso: string,
  timeZone: string,
  nowMs: number,
  unit?: VolumeUnit,
): KeepsakeMonth[] {
  return yearMarks(birthIso).map(mark => ({
    mark,
    figures: celebrationFigures(rows, monthWindow(mark, birthIso, timeZone, nowMs), timeZone, unit),
  }));
}

/* ------------------------------------------------------------------ out of the app */

/**
 * The keepsake as one printable HTML document, drawn by the visit summary's own renderer
 * (`printableDocument`): the same escaping, the same paper, no network, no script, no image.
 */
export function keepsakeHtml(k: YearKeepsake): string {
  return printableDocument({
    title: k.title,
    header: k.header,
    sections: k.sections,
    tables: k.months === null ? [] : [k.months],
    caveat: k.caveat,
  });
}

/** Every sentence the keepsake says, in one list: what its tests scan and a screen reader hears. */
export function keepsakeWords(k: YearKeepsake): string[] {
  const out: string[] = [k.title, k.caveat];
  const row = (r: VisitRow): string[] => [
    r.label,
    r.value,
    ...(r.note === undefined ? [] : [r.note]),
  ];
  for (const r of k.header) out.push(...row(r));
  for (const s of k.sections) {
    out.push(s.title);
    for (const r of s.rows) out.push(...row(r));
  }
  if (k.months !== null) {
    out.push(
      k.months.title,
      ...k.months.columns,
      ...(k.months.note === undefined ? [] : [k.months.note]),
    );
    for (const r of k.months.rows)
      out.push(r.label, ...(r.note === undefined ? [] : [r.note]), ...r.cells);
  }
  return out.filter(s => s !== '');
}
