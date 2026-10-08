/**
 * THE FIRST YEAR, KEPT (the owner, 2026-09-28: *"a year-one keepsake (Plus)"*). A document made of
 * the household's own log and nothing else: the year is the twelve monthly notes laid end to end,
 * every figure says what it was made of, a measurement is said as it was entered, and no word in
 * it grades, praises, compares or advises. The renderer is the visit summary's own.
 */
import { describe, expect, it } from 'vitest';
import { glanceVerdictHits } from '../reports/glance.banned';
import type { TodayActivity } from '../today/rows';
import { celebrationBannedHits, celebrationFigures, monthWindow, celebrationMarks } from './index';
import {
  KEEPSAKE_CAVEAT,
  keepsakeHtml,
  keepsakeMonths,
  keepsakeReady,
  keepsakeReadyOn,
  keepsakeTitle,
  keepsakeWords,
  keepsakeYear,
  yearKeepsake,
  type KeepsakeFormat,
  type KeepsakeInput,
} from './keepsake';

const TZ = 'America/New_York';
const BORN = '2025-03-03';
/** Noon on a day where the household is (EST until Mar 9, EDT from then; the test says which). */
const at = (iso: string, h = 12, offset = '-05:00'): number =>
  Date.parse(`${iso}T${String(h).padStart(2, '0')}:00:00${offset}`);
const summer = (iso: string, h = 12): number => at(iso, h, '-04:00');
const NOW = summer('2026-03-10', 15);

const row = (
  over: Partial<TodayActivity> & Pick<TodayActivity, 'id' | 'type' | 'startMs'>,
): TodayActivity => ({ childId: 'ada', endMs: null, isPrivate: false, createdBy: 'u1', ...over });

const dayFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: TZ,
});
const FMT: KeepsakeFormat = {
  volume: ml => `${Math.round(ml)} mL`,
  duration: min => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`,
  growth: (metric, v) => (metric === 'weight' ? `${v} g` : `${v} mm`),
  date: ms => dayFmt.format(ms),
  stamp: ms => `${dayFmt.format(ms)} at ${new Date(ms).toISOString().slice(11, 16)}`,
};

const YEAR: TodayActivity[] = [
  // before the birth: a pump, which is not the baby's first year
  row({ id: 'pre', type: 'pump', startMs: at('2025-02-20', 9), totalMl: 40 }),
  // month one
  row({ id: 'b1', type: 'bottle', startMs: at('2025-03-03', 18), consumedMl: 60 }),
  row({
    id: 'w1',
    type: 'bottle',
    startMs: at('2025-03-04', 18),
    consumedMl: 30,
    bottleKind: 'WATER',
  }),
  row({
    id: 'f1',
    type: 'breastfeed',
    startMs: at('2025-03-05', 6),
    endMs: at('2025-03-05', 6) + 50 * 60_000,
    leftSeconds: 10 * 60,
    rightSeconds: 12 * 60,
  }),
  row({ id: 'd1', type: 'diaper', startMs: at('2025-03-05', 7), diaperKind: 'WET' }),
  row({ id: 'd2', type: 'diaper', startMs: at('2025-03-05', 8), diaperKind: 'DRY' }),
  row({
    id: 's1',
    type: 'sleep',
    startMs: at('2025-03-05', 20),
    endMs: at('2025-03-05', 20) + 5 * 60 * 60_000,
  }),
  row({ id: 'g1', type: 'growth', startMs: at('2025-03-06', 10), weightG: 3400, lengthMm: 500 }),
  // month six: solids, a pump, a dirty change, a longer sleep
  row({
    id: 'm1',
    type: 'solids',
    startMs: summer('2025-08-10', 12),
    solidsItems: [{ name: 'Avocado', amount: null, unit: null, response: null }],
  }),
  row({
    id: 'm2',
    type: 'solids',
    startMs: summer('2025-08-20', 12),
    solidsItems: [
      { name: 'Banana', amount: null, unit: null, response: null },
      { name: 'Avocado', amount: null, unit: null, response: null },
    ],
  }),
  row({ id: 'p1', type: 'pump', startMs: summer('2025-08-11', 7), totalMl: 150 }),
  row({ id: 'd3', type: 'diaper', startMs: summer('2025-08-11', 8), diaperKind: 'DIRTY' }),
  row({
    id: 's2',
    type: 'sleep',
    startMs: summer('2025-08-12', 19),
    endMs: summer('2025-08-12', 19) + 9 * 60 * 60_000,
  }),
  // month twelve, and the birthday itself
  row({ id: 'g2', type: 'growth', startMs: at('2026-02-20', 10), weightG: 9100 }),
  row({ id: 'b2', type: 'bottle', startMs: at('2026-03-03', 8), consumedMl: 180 }),
  // after the birthday: not the first year
  row({ id: 'late', type: 'bottle', startMs: summer('2026-03-09', 8), consumedMl: 999 }),
];

const input = (over: Partial<KeepsakeInput> = {}): KeepsakeInput => ({
  childName: 'Ada',
  birthDate: BORN,
  timeZone: TZ,
  nowMs: NOW,
  rows: YEAR,
  vaccinesGiven: ['2025-03-03', '2025-05-05', '2026-03-03', '2026-03-05', 'not a date'],
  fmt: FMT,
  ...over,
});

const valueOf = (k: ReturnType<typeof yearKeepsake>, section: string, label: string) =>
  k.sections.find(s => s.key === section)?.rows.find(r => r.label === label);

describe('when it is ready', () => {
  it('is ready on the first birthday, clamped as every mark is, and not a day before', () => {
    expect(keepsakeReadyOn(BORN)).toBe('2026-03-03');
    expect(keepsakeReadyOn('2024-02-29')).toBe('2025-02-28');
    expect(keepsakeReady(BORN, '2026-03-02')).toBe(false);
    expect(keepsakeReady(BORN, '2026-03-03')).toBe(true);
    expect(keepsakeReady(BORN, '2027-11-01')).toBe(true);
  });

  it('has no birthday to wait for when the birth date does not parse', () => {
    expect(keepsakeReadyOn('')).toBeNull();
    expect(keepsakeReady('', '2026-03-03')).toBe(false);
  });
});

describe('the year', () => {
  it('runs from the day of birth to the first birthday, both in: the twelve notes laid end to end', () => {
    const y = keepsakeYear(BORN, TZ, NOW);
    const marks = celebrationMarks(BORN).filter(m => m.monthNumber <= 12);
    expect(y.fromMs).toBe(Date.parse('2025-03-03T00:00:00-05:00'));
    expect(y.toMs).toBe(Date.parse('2026-03-04T00:00:00-05:00'));
    expect(y.fromMs).toBe(monthWindow(marks[0]!, BORN, TZ, NOW).fromMs);
    expect(y.toMs).toBe(monthWindow(marks[11]!, BORN, TZ, NOW).toMs);
    expect(y.days).toBe(366);
  });

  it('adds the twelve months up to the year: they tile, so nothing is counted twice or missed', () => {
    const months = keepsakeMonths(YEAR, BORN, TZ, NOW);
    const year = celebrationFigures(YEAR, keepsakeYear(BORN, TZ, NOW), TZ);
    expect(months).toHaveLength(12);
    const sum = (
      k: 'milkMl' | 'bottles' | 'diapers' | 'pumpedMl' | 'sleepMinutes' | 'loggedDays',
    ) => months.reduce((n, m) => n + m.figures[k], 0);
    for (const k of [
      'milkMl',
      'bottles',
      'diapers',
      'pumpedMl',
      'sleepMinutes',
      'loggedDays',
    ] as const)
      expect(sum(k), k).toBe(year[k]);
  });
});

describe('what it says', () => {
  const k = yearKeepsake(input());

  it('is headed by the child, the year, the days with entries and when it was made', () => {
    expect(k.title).toBe('Ada’s first year');
    const header = Object.fromEntries(k.header.map(r => [r.label, r]));
    expect(header['Child']?.value).toBe('Ada');
    expect(header['Born']?.value).toBe('Mar 3, 2025');
    expect(header['The year']?.value).toBe('Mar 3, 2025 to Mar 3, 2026');
    // an entry on the day of birth: no "First entry" row
    expect(header['First entry']).toBeUndefined();
    expect(header['Days with entries']?.note).toBe('of 366 days');
    expect(header['Prepared']).toBeDefined();
  });

  it('counts the year and nothing either side of it', () => {
    // the bottles of milk: 60 on the day of birth and 180 on the birthday; water is no feed, and
    // the 999 after the birthday is the second year's
    expect(valueOf(k, 'feeds', 'Bottles of milk')?.value).toBe('2');
    expect(valueOf(k, 'feeds', 'Milk from bottles')).toEqual({
      label: 'Milk from bottles',
      value: '240 mL',
      note: 'over 2 bottles',
    });
    // the pump before the birth is not the baby's
    expect(valueOf(k, 'pumping', 'Pumped')).toEqual({
      label: 'Pumped',
      value: '150 mL',
      note: 'over 1 session',
    });
  });

  it('says a breastfeed’s recorded minutes, and the changes without the dry check', () => {
    expect(valueOf(k, 'feeds', 'Breastfeeds')?.value).toBe('1');
    expect(valueOf(k, 'feeds', 'Time at the breast')?.value).toBe('0h 22m');
    expect(valueOf(k, 'diapers', 'Changes')).toEqual({
      label: 'Changes',
      value: '2',
      note: '1 wet · 1 dirty',
    });
    // the row never says its section's name again (2026-09-29)
    for (const s of k.sections) for (const r of s.rows) expect(r.label, s.key).not.toBe(s.title);
  });

  it('says the sleep with its sample size, and when the longest stretch began', () => {
    expect(valueOf(k, 'sleep', 'Sleep logged')).toEqual({
      label: 'Sleep logged',
      value: '14h 0m',
      note: 'over 2 sleeps',
    });
    const longest = valueOf(k, 'sleep', 'Longest stretch');
    expect(longest?.value).toBe('9h 0m');
    expect(longest?.note).toContain('Aug 12, 2025');
  });

  it('names every food tried, in the order first eaten, each with its day', () => {
    const solids = k.sections.find(s => s.key === 'solids')?.rows ?? [];
    expect(solids.find(r => r.label === 'Meals')?.value).toBe('2');
    expect(solids.find(r => r.label === 'Foods tried')?.value).toBe('2');
    const foods = solids.filter(r => r.sub === true);
    expect(foods.map(r => r.label)).toEqual(['Avocado', 'Banana']);
    expect(foods[0]).toMatchObject({ value: 'first eaten Aug 10, 2025', note: '2 times' });
  });

  it('says a measurement as it was entered, the first and the latest, and no change between them', () => {
    const growth = k.sections.find(s => s.key === 'growth')?.rows ?? [];
    expect(growth.map(r => r.label)).toEqual(['First weight', 'Latest weight', 'Length']);
    expect(growth[0]).toMatchObject({ value: '3400 g', note: 'Mar 6, 2025' });
    expect(growth[1]).toMatchObject({ value: '9100 g', note: 'Feb 20, 2026 · 2 measurements' });
    expect(growth[2]).toMatchObject({ value: '500 mm', note: 'Mar 6, 2025 · 1 measurement' });
    // no difference, no rate, no percentile: nothing a growth chart would say
    for (const r of growth)
      expect(`${r.value} ${r.note ?? ''}`).not.toMatch(/[+−]|per |percentile/);
  });

  it('counts the doses marked given in the year, and only those', () => {
    // three in the year (the day of birth and the birthday both in), one after it, one not a date
    expect(valueOf(k, 'vaccines', 'Vaccine doses')?.value).toBe('3');
  });

  it('draws only the sections with something in them, in the order the year is told', () => {
    expect(k.sections.map(s => s.key)).toEqual([
      'feeds',
      'diapers',
      'sleep',
      'pumping',
      'solids',
      'growth',
      'vaccines',
    ]);
    const none = yearKeepsake(input({ rows: YEAR.filter(r => r.type === 'bottle') }));
    expect(none.sections.map(s => s.key)).toEqual(['feeds', 'vaccines']);
  });
});

describe('the twelve months, as a table', () => {
  const k = yearKeepsake(input());

  it('is a row a month, the first birthday last, each with its days with entries', () => {
    expect(k.months?.rows.map(r => r.label)).toEqual([
      '1 month',
      '2 months',
      '3 months',
      '4 months',
      '5 months',
      '6 months',
      '7 months',
      '8 months',
      '9 months',
      '10 months',
      '11 months',
      '1 year',
    ]);
    expect(k.months?.rows[0]?.note).toBe('Apr 3, 2025');
    expect(k.months?.rows[11]?.note).toBe('Mar 3, 2026');
    expect(k.months?.columns.slice(0, 2)).toEqual(['Month', 'Days with entries']);
    // month one: the day of birth to the first month mark, 32 days, 4 of them with entries
    expect(k.months?.rows[0]?.cells[0]).toBe('4 of 32');
  });

  it('draws a column only for a figure some month has, and leaves a month without it empty', () => {
    const cols = k.months?.columns ?? [];
    expect(cols).toEqual([
      'Month',
      'Days with entries',
      'Milk',
      'Breastfeeds',
      'Sleep a day',
      'Longest stretch',
      'Diapers a day',
      'Pumped',
    ]);
    const pumped = cols.indexOf('Pumped') - 1;
    expect(k.months?.rows[0]?.cells[pumped]).toBe('');
    expect(k.months?.rows[5]?.cells[pumped]).toBe('150 mL');
  });

  it('starts at the month that holds the first entry, and says where the log starts', () => {
    const later = yearKeepsake(input({ rows: YEAR.filter(r => r.startMs > summer('2025-08-01')) }));
    expect(later.months?.rows[0]?.label).toBe('6 months');
    const header = Object.fromEntries(later.header.map(r => [r.label, r]));
    expect(header['First entry']?.value).toBe('Aug 10, 2025');
    expect(header['Days with entries']?.note).toBe('of 206 days from the first entry');
  });

  it('is nothing, and the keepsake says it is empty, when the year holds no entry at all', () => {
    const empty = yearKeepsake(input({ rows: [], vaccinesGiven: [] }));
    expect(empty.empty).toBe(true);
    expect(empty.months).toBeNull();
    expect(empty.sections).toEqual([]);
  });
});

describe('its words', () => {
  const k = yearKeepsake(input());
  const words = keepsakeWords(k);

  it('carry no verdict, no praise, no advice and no comparison, anywhere in it', () => {
    expect(words.length).toBeGreaterThan(60);
    for (const w of words) {
      expect(celebrationBannedHits(w), w).toEqual([]);
      expect(glanceVerdictHits(w), w).toEqual([]);
    }
  });

  it('never write a dash, the app’s rule for every sentence a parent reads', () => {
    for (const w of words) expect(w, w).not.toMatch(/[—–]/);
  });

  it('say whose record it is and what it is not', () => {
    expect(KEEPSAKE_CAVEAT).toContain('what this household logged');
    expect(KEEPSAKE_CAVEAT).toContain('not the same as nothing happening');
    expect(keepsakeTitle('')).toBe('The first year');
    expect(keepsakeTitle(' Leo ')).toBe('Leo’s first year');
  });
});

describe('the printed keepsake', () => {
  const html = keepsakeHtml(yearKeepsake(input({ childName: 'Ada <b>"Bee"</b>' })));

  it('is a complete standalone document, named for the child', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('<title>Ada &lt;b&gt;&quot;Bee&quot;&lt;/b&gt;’s first year</title>');
    expect(html).not.toContain('<b>');
  });

  it('carries the months as a real table, and the caveat after it', () => {
    expect(html).toContain('<table>');
    expect(html).toContain('<th scope="col">Days with entries</th>');
    expect(html).toContain('<th scope="row">1 year');
    expect(html.indexOf('<table>')).toBeLessThan(html.indexOf('class="caveat"'));
  });

  it('reaches for nothing: no script, no image, no link, no web font', () => {
    expect(html).not.toMatch(/<script|<img|<link|src=|href=|https?:|@import|url\(/i);
  });
});
