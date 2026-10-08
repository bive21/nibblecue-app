import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { diaperInsight, milkFlow, sleepInsight, type GrowthMetric } from './insights';
import { reportBannedHits } from './observations';
import { printableHtml } from './printable';
import { dayBuckets, rangeOf } from './range';
import { reportSeries } from './series';
import { feedGapMinutes, reportStats } from './stats';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';
import type { SolidsItem } from '../solids/items';
import {
  daysSince,
  VISIT_CAVEAT,
  visitSheet,
  visitSheetText,
  type VisitFormat,
  type VisitSheet,
} from './visitSheet';

const TZ = 'America/Los_Angeles';
/** The default waking window: what fills the kind on an entry that carries none. */
const CLASSIFY = { timeZone: TZ, window: DEFAULT_DAY_WINDOW };
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOW = at(12);
const RANGE = rangeOf('week', TZ, NOW);
const BUCKETS = dayBuckets(RANGE, TZ);
const NO_TIMERS: ActiveTimer[] = [];

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};

const fmt: VisitFormat = {
  volume: ml => `${Math.round(ml / 29.5735)} oz`,
  duration: min =>
    min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`,
  temperature: c => `${(c / 100).toFixed(1)} °C`,
  growth: (metric: GrowthMetric, v) =>
    metric === 'weight' ? `${(v / 1000).toFixed(2)} kg` : `${(v / 10).toFixed(1)} cm`,
  stamp: ms => `stamp:${ms}`,
  // DAY-GRANULAR, like the real `visitFormat.day` — the rash row groups by what this returns, so a
  // fixture that gave every instant its own string would have proved the grouping worked when it
  // did not. The zone is UTC here only because the fixture needs no other one.
  day: ms => `day:${new Date(ms).toISOString().slice(0, 10)}`,
};
/** The label the fixture's `day` gives an instant — what an assertion about the rash days reads. */
const dayOf = (ms: number): string => `day:${new Date(ms).toISOString().slice(0, 10)}`;

const build = (rows: TodayActivity[], growthRows: TodayActivity[] = []): VisitSheet => {
  const series = reportSeries(rows, NO_TIMERS, RANGE, TZ, NOW);
  return visitSheet({
    childName: 'Emma',
    birthDate: '2026-06-01',
    ageLabel: '3 months',
    range: RANGE,
    nowMs: NOW,
    rows,
    growthRows,
    stats: reportStats(rows, series, RANGE),
    sleep: sleepInsight(rows, NO_TIMERS, BUCKETS, RANGE, NOW, CLASSIFY),
    milk: milkFlow(rows, series, RANGE),
    diapers: diaperInsight(rows, BUCKETS, RANGE),
    feedGapMinutes: feedGapMinutes(rows, RANGE),
    fmt,
  });
};

const ROWS: TodayActivity[] = [
  row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
  row({ type: 'bottle', startMs: at(11), consumedMl: 90 }),
  row({ type: 'breastfeed', startMs: at(6), endMs: at(6, 25) }),
  row({ type: 'diaper', startMs: at(9), diaperKind: 'WET', diaperRash: true }),
  row({ type: 'diaper', startMs: at(10), diaperKind: 'BOTH' }),
  row({ type: 'diaper', startMs: at(11, 0, 13), diaperKind: 'DRY', diaperRash: true }),
  row({ type: 'sleep', startMs: at(1), endMs: at(4), sleepKind: 'NIGHT' }),
  row({ type: 'sleep', startMs: at(9, 30), endMs: at(10, 15), sleepKind: 'NAP' }),
  row({ type: 'temp', startMs: at(7), tempCHundredths: 3840, tempMethod: 'RECTAL' }),
  row({ type: 'temp', startMs: at(21, 0, 13), tempCHundredths: 3710, tempMethod: 'ARMPIT' }),
  row({
    type: 'med',
    startMs: at(8, 5),
    medName: 'Barrier cream',
    medAmount: 'a thin layer',
    medRoute: 'SKIN',
  }),
  row({ type: 'med', startMs: at(20, 0, 13), medName: 'Barrier cream', medRoute: 'SKIN' }),
  row({ type: 'bath', startMs: at(19, 0, 13), notes: 'a bit of a rash under the arm' }),
];

const allRows = (sheet: VisitSheet) => sheet.sections.flatMap(s => s.rows);
const section = (sheet: VisitSheet, key: string) =>
  sheet.sections.find(s => s.key === key) ?? { rows: [], title: '', key, empty: undefined };

describe('the sheet answers a clinician’s first three questions', () => {
  it('names the child, the window and when it was made', () => {
    const sheet = build(ROWS);
    expect(sheet.header.map(r => r.label)).toEqual([
      'Child',
      'Date of birth',
      'Period covered',
      'Prepared',
    ]);
    expect(sheet.header[0]?.value).toBe('Emma');
    expect(sheet.header[2]?.note).toBe('over 7 days');
  });

  it('omits the date of birth rather than inventing one', () => {
    const sheet = visitSheet({
      ...{
        childName: 'Emma',
        birthDate: '',
        ageLabel: '',
        range: RANGE,
        nowMs: NOW,
        rows: [],
        growthRows: [],
        stats: reportStats([], reportSeries([], NO_TIMERS, RANGE, TZ, NOW), RANGE),
        sleep: sleepInsight([], NO_TIMERS, BUCKETS, RANGE, NOW, CLASSIFY),
        milk: milkFlow([], reportSeries([], NO_TIMERS, RANGE, TZ, NOW), RANGE),
        diapers: diaperInsight([], BUCKETS, RANGE),
        feedGapMinutes: null,
        fmt,
      },
    });
    expect(sheet.header.map(r => r.label)).not.toContain('Date of birth');
  });
});

describe('every figure carries its sample size and its window', () => {
  const sheet = build(ROWS);

  it('reports feeding per day AND in total, both kinds', () => {
    const feeding = section(sheet, 'feeding').rows;
    expect(feeding.find(r => r.label === 'Bottles a day')?.note).toBe('2 bottles in total');
    expect(feeding.find(r => r.label === 'Average bottle')?.note).toBe('over 2 bottles');
    expect(feeding.find(r => r.label === 'Breastfeeds a day')).toBeDefined();
    expect(feeding.find(r => r.label === 'Between feeds')?.note).toMatch(/start to start/);
  });

  it('counts BOTH in each diaper kind, as everywhere else in the app', () => {
    const output = section(sheet, 'output').rows;
    expect(output.find(r => r.label === 'Wet a day')?.value).toBe('0.3');
    expect(output.find(r => r.label === 'Dirty a day')?.value).toBe('0.1');
  });

  it('says how long since the last of each kind, from the WHOLE record', () => {
    // a seven-day window would hide "nothing in nine days", which is the fact that matters
    const output = section(sheet, 'output').rows;
    expect(output.find(r => r.label === 'Last dirty diaper')?.value).toBeDefined();
    const old = [row({ type: 'diaper', startMs: NOW - 3 * 86_400_000, diaperKind: 'DIRTY' })];
    const stale = build(old);
    expect(section(stale, 'output').rows.find(r => r.label === 'Last dirty diaper')?.value).toBe(
      '3 days ago',
    );
  });

  /**
   * The rash tick, which the sheet is the FIRST place to read back (the owner, 2026-09-19). These
   * assertions are deliberately about the count and the dates and nothing else: there is no
   * severity to assert because the app never asks for one, and the banned-phrase lint below runs
   * over this row like every other.
   */
  it('counts the entries with a rash noted, and names the days they fall on', () => {
    const rash = section(sheet, 'output').rows.find(r => r.label === 'Rash noted');
    expect(rash?.value).toBe('2 entries');
    // oldest day first, which is reading order for a list of dates
    expect(rash?.note).toBe(`2 days · ${dayOf(at(11, 0, 13))}, ${dayOf(at(9))}`);
  });

  it('counts a rash noted on a DRY check too — the DRY exclusion is about the wet/dirty rhythm', () => {
    const dryOnly = build([
      row({ type: 'diaper', startMs: at(9), diaperKind: 'DRY', diaperRash: true }),
    ]);
    const rash = section(dryOnly, 'output').rows.find(r => r.label === 'Rash noted');
    expect(rash?.value).toBe('1 entry');
    // and the wet/dirty arithmetic still ignores it, as it always did
    expect(section(dryOnly, 'output').rows.find(r => r.label === 'Wet a day')?.value).toBe('0.0');
  });

  it('counts the entries, not the days: three ticks on one day is three entries on one day', () => {
    const sameDay = build([
      row({ type: 'diaper', startMs: at(7), diaperKind: 'WET', diaperRash: true }),
      row({ type: 'diaper', startMs: at(8), diaperKind: 'WET', diaperRash: true }),
      row({ type: 'diaper', startMs: at(9), diaperKind: 'DIRTY', diaperRash: true }),
    ]);
    const rash = section(sameDay, 'output').rows.find(r => r.label === 'Rash noted');
    expect(rash?.value).toBe('3 entries');
    expect(rash?.note).toBe(`1 day · ${dayOf(at(7))}`);
  });

  it('caps the list of days rather than printing a paragraph of dates', () => {
    // a month, because eleven distinct days do not fit in the seven-day window `build` uses
    const month = rangeOf('month', TZ, NOW);
    const rows = Array.from({ length: 11 }, (_, i) =>
      row({ type: 'diaper', startMs: at(9) - i * 86_400_000, diaperKind: 'WET', diaperRash: true }),
    );
    const series = reportSeries(rows, NO_TIMERS, month, TZ, NOW);
    const buckets = dayBuckets(month, TZ);
    const sheet = visitSheet({
      childName: 'Emma',
      birthDate: '2026-06-01',
      ageLabel: '3 months',
      range: month,
      nowMs: NOW,
      rows,
      growthRows: [],
      stats: reportStats(rows, series, month),
      sleep: sleepInsight(rows, NO_TIMERS, buckets, month, NOW, CLASSIFY),
      milk: milkFlow(rows, series, month),
      diapers: diaperInsight(rows, buckets, month),
      feedGapMinutes: feedGapMinutes(rows, month),
      fmt,
    });
    const note = section(sheet, 'output').rows.find(r => r.label === 'Rash noted')?.note ?? '';
    expect(note.startsWith('11 days · ')).toBe(true);
    expect(note.endsWith(', +3 more')).toBe(true);
    expect(note.split(', +')[0]?.split(', ')).toHaveLength(8);
  });

  it('says none was logged rather than dropping the row, so the answer is on the page either way', () => {
    const none = build([row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' })]);
    const rash = section(none, 'output').rows.find(r => r.label === 'Rash noted');
    expect(rash?.value).toBe('None logged in this period');
    expect(rash?.note).toBeUndefined();
  });

  it('leaves the rash row last, and never moves it because the number grew', () => {
    const labels = (sheet: VisitSheet) => section(sheet, 'output').rows.map(r => r.label);
    const lots = build(
      Array.from({ length: 20 }, (_, i) =>
        row({ type: 'diaper', startMs: at(9) - i * 3600_000, diaperKind: 'WET', diaperRash: true }),
      ),
    );
    expect(labels(sheet).at(-1)).toBe('Rash noted');
    expect(labels(lots)).toEqual(labels(sheet));
  });

  it('says "none logged", never "none happened"', () => {
    const none = build([row({ type: 'bottle', startMs: at(8), consumedMl: 100 })]);
    expect(section(none, 'output').rows.find(r => r.label === 'Last dirty diaper')?.value).toBe(
      'None logged in this record',
    );
  });
});

describe('temperature is every reading, in order, with its method', () => {
  const temps = section(build(ROWS), 'temperature').rows;

  it('lists them newest first and never averages them', () => {
    expect(temps).toHaveLength(2);
    expect(temps[0]?.value).toBe('38.4 °C');
    expect(temps[1]?.value).toBe('37.1 °C');
    expect(temps[0]?.note).toBe('rectal');
    expect(temps.some(r => /average|mean/i.test(r.label))).toBe(false);
  });

  it('owns no threshold: nothing is labelled high, low or normal', () => {
    for (const r of temps) {
      expect(reportBannedHits(`${r.label} ${r.value} ${r.note ?? ''}`)).toEqual([]);
    }
  });
});

describe('medicines are the household’s own words, never arithmetic on a dose', () => {
  const meds = section(build(ROWS), 'medicines').rows;

  it('groups by the name as logged and counts the times', () => {
    expect(meds).toHaveLength(1);
    expect(meds[0]?.label).toBe('Barrier cream');
    expect(meds[0]?.value).toBe('2 times over 7 days');
  });

  it('repeats the amount as typed and never totals it', () => {
    expect(meds[0]?.note).toContain('a thin layer');
    expect(meds[0]?.note).toContain('on skin');
    // no "4 ml total", no "2 × 2.5 ml" — an amount in this app is text, not a number
    expect(meds[0]?.value).not.toMatch(/\d\s*(ml|mg)/i);
  });

  it('says how it was given in words, never as the stored token, and nothing when it did not say', () => {
    const rows = section(
      build([
        row({
          type: 'med',
          startMs: at(8),
          medName: 'Iron',
          medAmount: '1 drop',
          medRoute: 'MOUTH',
        }),
        row({ type: 'med', startMs: at(9), medName: 'Drops in the bottle', medRoute: 'WITH_FOOD' }),
        row({
          type: 'med',
          startMs: at(10),
          medName: 'Gel',
          medAmount: 'a dab',
          medRoute: 'OTHER',
        }),
        row({ type: 'med', startMs: at(11), medName: 'Spray', medRoute: 'NOSE' }),
      ]),
      'medicines',
    ).rows;
    const note = (label: string) => rows.find(r => r.label === label)?.note ?? '';
    expect(note('Iron')).toBe('1 drop · oral · last stamp:' + at(8));
    expect(note('Drops in the bottle')).toBe('with milk/food · last stamp:' + at(9));
    expect(note('Gel')).toBe('a dab · last stamp:' + at(10));
    expect(note('Spray')).toBe('last stamp:' + at(11));
    for (const r of rows) expect(r.note).not.toMatch(/[A-Z_]{4,}/);
  });
});

describe('the notes are verbatim, newest first, and not summarised', () => {
  it('carries the household’s own sentence', () => {
    const notes = section(build(ROWS), 'notes').rows;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.value).toBe('a bit of a rash under the arm');
    expect(notes[0]?.note).toBe('bath');
  });

  it('caps the list rather than printing a year of them', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      row({ type: 'bath', startMs: at(9) - i * 60_000, notes: `note ${i}` }),
    );
    expect(section(build(many), 'notes').rows).toHaveLength(12);
  });
});

describe('growth reads its own window and states the change with its span', () => {
  it('gives the latest value, the day, and the change', () => {
    const growthRows = [
      row({ type: 'growth', startMs: at(9, 0, 1), weightG: 4200, lengthMm: 540 }),
      row({ type: 'growth', startMs: at(9, 0, 15), weightG: 4600, lengthMm: 556 }),
    ];
    const rows = section(build(ROWS, growthRows), 'growth').rows;
    expect(rows.map(r => r.label)).toEqual(['Weight', 'Length']);
    expect(rows[0]?.value).toBe('4.60 kg');
    expect(rows[0]?.note).toContain('+0.40 kg over 14 days');
  });

  it('is an empty section, with a sentence, when nothing was measured', () => {
    const g = section(build(ROWS), 'growth');
    expect(g.rows).toEqual([]);
    expect(g.empty).toBe('None recorded.');
  });
});

describe('nothing on the sheet interprets, flags or advises', () => {
  const sheet = build(ROWS);

  it('passes the same lint as every other report output', () => {
    for (const r of [...sheet.header, ...allRows(sheet)]) {
      const line = `${r.label} ${r.value} ${r.note ?? ''}`;
      expect(reportBannedHits(line), line).toEqual([]);
    }
    for (const s of sheet.sections) {
      expect(reportBannedHits(s.title), s.title).toEqual([]);
      if (s.empty !== undefined) expect(reportBannedHits(s.empty), s.empty).toEqual([]);
    }
  });

  it('says what a gap in the record means, and does not claim it is an absence', () => {
    expect(sheet.caveat).toBe(VISIT_CAVEAT);
    expect(sheet.caveat).toMatch(/not the same as nothing happening/);
    expect(sheet.caveat).toMatch(/has been interpreted/);
  });

  it('keeps the sections in a fixed order — never sorted by anything like severity', () => {
    // Sleep leads (the owner, 2026-09-18: "sleeping statistic should be number one in export").
    // The order is FIXED, which is the point of this test: it is decided once, here, and never
    // by what any household's numbers happen to look like.
    expect(sheet.sections.map(s => s.key)).toEqual([
      'sleep',
      'feeding',
      'output',
      'temperature',
      'medicines',
      'growth',
      // the Health notes (2026-10-08): drawn in one fixed place whether or not there are any
      'healthNotes',
      'notes',
    ]);
  });
});

describe('daysSince — the elapsed that a window would hide', () => {
  it('counts whole days back from the newest match', () => {
    const rows = [
      row({ type: 'diaper', startMs: NOW - 5 * 86_400_000, diaperKind: 'DIRTY' }),
      row({ type: 'diaper', startMs: NOW - 2 * 86_400_000 - 3600_000, diaperKind: 'DIRTY' }),
    ];
    expect(daysSince(rows, NOW, r => r.diaperKind === 'DIRTY')?.days).toBe(2);
  });

  it('is null when nothing matches, which is a different fact from zero', () => {
    expect(daysSince([], NOW, () => true)).toBeNull();
    expect(daysSince(ROWS, NOW, r => r.type === 'solids')).toBeNull();
  });

  it('ignores an entry dated in the future rather than reporting a negative', () => {
    const future = [row({ type: 'diaper', startMs: NOW + 86_400_000, diaperKind: 'DIRTY' })];
    expect(daysSince(future, NOW, r => r.type === 'diaper')).toBeNull();
  });
});

describe('the plain-text copy is the same sheet, for mail or a printer', () => {
  const text = visitSheetText(build(ROWS));

  it('carries every section, its rows and the caveat', () => {
    expect(text.startsWith('Visit summary')).toBe(true);
    for (const title of ['FEEDING', 'DIAPERS', 'SLEEP', 'TEMPERATURE READINGS']) {
      expect(text).toContain(title);
    }
    expect(text).toContain('Child: Emma');
    expect(text.endsWith(VISIT_CAVEAT)).toBe(true);
  });

  it('writes the empty sentence for a section with nothing in it', () => {
    expect(visitSheetText(build([]))).toContain('No feeds logged in this period.');
  });
});

/**
 * SOLIDS ON THE VISIT SHEET (docs/SOLIDS.md §5): meals and foods counted, each food eaten for the
 * first time dated — measured against the whole record, so a food from before the period is not
 * "first" — and every word the parent wrote about a meal, verbatim. No food is marked.
 */
describe('solids on the visit sheet', () => {
  const food = (name: string, over: Partial<SolidsItem> = {}): SolidsItem => ({
    name,
    amount: null,
    unit: null,
    response: null,
    ...over,
  });
  const meal = (startMs: number, items: SolidsItem[], observation?: string) =>
    row({
      type: 'solids',
      startMs,
      solidsItems: items,
      ...(observation === undefined ? {} : { observation }),
    });

  it('is absent for a baby who has not started solids', () => {
    expect(build(ROWS).sections.map(s => s.key)).not.toContain('solids');
  });

  it('counts meals and foods, dates each first time, and quotes the parent', () => {
    const before = meal(at(9, 0, 1), [food('Banana')]); // two weeks earlier: not a first this week
    const rows = [
      ...ROWS,
      meal(at(8, 0, 12), [
        food('Strawberry', { amount: 5, unit: 'PIECE', response: 'LOVED' }),
        food('Banana'),
      ]),
      meal(
        at(8, 0, 13),
        [food('strawberries', { response: 'DISLIKED' })],
        ' red patch by the mouth ',
      ),
    ];
    const sheet = visitSheet({
      ...buildInput(rows),
      meals: [
        { id: 'b', childId: 'kid', atMs: before.startMs, items: [food('Banana')] },
        ...rows
          .filter(r => r.type === 'solids')
          .map(r => ({
            id: r.id,
            childId: 'kid',
            atMs: r.startMs,
            items: r.solidsItems ?? [],
            observation: r.observation ?? null,
          })),
      ],
    });
    const solids = sheet.sections.find(s => s.key === 'solids');
    expect(solids?.rows.map(r => [r.label, r.value])).toEqual([
      ['Meals', '2'],
      ['Foods eaten', '2'],
      ['strawberries', `first eaten ${dayOf(at(8, 0, 12))}`],
      ['Also eaten', 'Banana'],
      [`Noticed · stamp:${at(8, 0, 13)}`, 'red patch by the mouth'],
    ]);
    expect(solids?.rows[2]?.note).toBe("2 times · loved 1 · didn't like 1");
    // THE FOODS SIT UNDER "Foods eaten" (the owner, 2026-09-24: "these should be a subcategory
    // of food eaten. so make sure it is tabbed") — the two figures and the parent's notes do not
    expect(solids?.rows.map(r => r.sub === true)).toEqual([false, false, true, true, false]);
    const text = visitSheetText(sheet);
    expect(text).toContain(
      '\n  Foods eaten: 2 (1 for the first time)\n    - strawberries: first eaten',
    );
    expect(text).toContain('\n    - Also eaten: Banana');
    expect(text).toContain(`\n  Noticed · stamp:${at(8, 0, 13)}: red patch by the mouth`);
    expect(printableHtml(sheet)).toContain(
      '<div class="row sub"><span class="label">strawberries</span>',
    );
    expect(printableHtml(sheet)).toContain(
      '<div class="row"><span class="label">Foods eaten</span>',
    );
    // its place: straight after feeding
    const keys = sheet.sections.map(s => s.key);
    expect(keys.indexOf('solids')).toBe(keys.indexOf('feeding') + 1);
    // and nothing on it grades a food or the baby
    expect(reportBannedHits(visitSheetText(sheet))).toEqual([]);
    expect(visitSheetText(sheet)).not.toMatch(/allerg|safe|risk|should/i);
  });

  it('reads an older meal’s text as its foods', () => {
    const rows = [...ROWS, row({ type: 'solids', startMs: at(8, 0, 12), food: 'Oatmeal, pear' })];
    const solids = build(rows).sections.find(s => s.key === 'solids');
    expect(solids?.rows.find(r => r.label === 'Foods eaten')?.value).toBe('2');
  });
});

function buildInput(rows: TodayActivity[]) {
  const series = reportSeries(rows, NO_TIMERS, RANGE, TZ, NOW);
  return {
    childName: 'Emma',
    birthDate: '2026-06-01',
    ageLabel: '3 months',
    range: RANGE,
    nowMs: NOW,
    rows,
    growthRows: [],
    stats: reportStats(rows, series, RANGE),
    sleep: sleepInsight(rows, NO_TIMERS, BUCKETS, RANGE, NOW, CLASSIFY),
    milk: milkFlow(rows, series, RANGE),
    diapers: diaperInsight(rows, BUCKETS, RANGE),
    feedGapMinutes: feedGapMinutes(rows, RANGE),
    fmt,
  };
}

/*
  THE AUDIT FIXES OF 2026-09-24 ON THE PAGE A CLINICIAN READS.
*/
describe('the visit summary names the newest first times and counts the rest', () => {
  const food = (name: string): SolidsItem => ({ name, amount: null, unit: null, response: null });
  // fifteen foods, each eaten for the first time on its own hour of the week, oldest first
  const NAMES = Array.from({ length: 15 }, (_, i) => `Food ${String(i + 1).padStart(2, '0')}`);
  const meals = NAMES.map((name, i) =>
    row({ type: 'solids', startMs: at(6 + i, 0, 13), solidsItems: [food(name)] }),
  );

  it('keeps the latest twelve, in date order, with a row counting the three before them', () => {
    const solids = section(build([...ROWS, ...meals]), 'solids').rows;
    const labels = solids.map(r => r.label);
    // the newest introductions are the ones a visit is most likely to be about (the solids
    // audit, M7): nothing is dropped from the end any more
    expect(labels).toContain('Food 15');
    expect(labels).not.toContain('Food 03');
    const earlier = solids.find(r => r.label === 'Earlier first times');
    expect(earlier?.value).toBe('+3');
    expect(earlier?.sub).toBe(true);
    expect(earlier?.note).toBe('each one is in the log, and in the full download');
    const named = solids.filter(r => r.label.startsWith('Food '));
    expect(named.map(r => r.label)).toEqual(NAMES.slice(3));
    // the count sits above the foods it stands for, under "Foods eaten"
    expect(labels.indexOf('Earlier first times')).toBe(labels.indexOf('Foods eaten') + 1);
    expect(solids.find(r => r.label === 'Foods eaten')?.note).toBe('15 for the first time');
  });

  it('adds no overflow row when every first time fits', () => {
    const solids = section(build([...ROWS, ...meals.slice(0, 12)]), 'solids').rows;
    expect(solids.some(r => r.label === 'Earlier first times')).toBe(false);
  });
});

describe('a medicine row says which times its amount describes', () => {
  const med = (h: number, day: number, amount?: string) =>
    row({
      type: 'med',
      startMs: at(h, 0, day),
      medName: 'Fever reducer',
      medRoute: 'MOUTH',
      ...(amount === undefined ? {} : { medAmount: amount }),
    });
  const noteOf = (rows: TodayActivity[]) =>
    section(build(rows), 'medicines').rows.find(r => r.label === 'Fever reducer')?.note ?? '';

  it('says an amount that differed is the last time’s, never all of them (M8)', () => {
    const note = noteOf([med(8, 12, '5 ml'), med(8, 13, '5 ml'), med(8, 14, '2.5 ml')]);
    expect(note).toBe(`2.5 ml the last time · oral · last stamp:${at(8, 0, 14)}`);
  });

  it('says an amount every time shared once, as each time', () => {
    const note = noteOf([med(8, 13, ' 5 ml '), med(8, 14, '5 ml')]);
    expect(note).toBe(`5 ml each time · oral · last stamp:${at(8, 0, 14)}`);
  });

  it('never borrows an older amount for a last time that had none', () => {
    const note = noteOf([med(8, 13, '5 ml'), med(8, 14)]);
    expect(note).toBe(`oral · last stamp:${at(8, 0, 14)}`);
  });

  it('still reads a single time exactly as it was typed', () => {
    expect(noteOf([med(8, 14, '1 drop')])).toBe(`1 drop · oral · last stamp:${at(8, 0, 14)}`);
  });
});

describe('the feeding block counts milk, and a session lasts its recorded minutes', () => {
  it('leaves a bottle of water out of the bottles a day (M7)', () => {
    const feeding = section(
      build([
        row({ type: 'bottle', startMs: at(8), consumedMl: 120, bottleKind: 'EBM' }),
        row({ type: 'bottle', startMs: at(9), consumedMl: 60, bottleKind: 'WATER' }),
      ]),
      'feeding',
    ).rows;
    expect(feeding.find(r => r.label === 'Bottles a day')?.note).toBe('1 bottle in total');
    expect(feeding.find(r => r.label === 'Average bottle')?.value).toBe('4 oz');
  });

  it('averages a breastfeed over the minutes at the breast, not a paused span (H1)', () => {
    const feeding = section(
      build([
        row({
          type: 'breastfeed',
          startMs: at(8),
          endMs: at(8, 30),
          leftSeconds: 600,
          rightSeconds: 480,
        }),
      ]),
      'feeding',
    ).rows;
    expect(feeding.find(r => r.label === 'Average session')?.value).toBe('18m');
  });
});
