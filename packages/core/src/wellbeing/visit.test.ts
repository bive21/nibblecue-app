import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';
import { diaperInsight, milkFlow, sleepInsight } from '../reports/insights';
import { reportBannedHits } from '../reports/observations';
import { printableHtml } from '../reports/printable';
import { dayBuckets, rangeOf } from '../reports/range';
import { reportSeries } from '../reports/series';
import { feedGapMinutes, reportStats } from '../reports/stats';
import {
  VISIT_CAVEAT,
  visitSheet,
  visitSheetText,
  type VisitFormat,
  type VisitSheet,
} from '../reports/visitSheet';
import {
  NOTE_NAME,
  NOTE_SUBTITLE,
  NOTES_TITLE,
  noteLine,
  noteProblem,
  SEEN_LABEL,
  seenOf,
  seenText,
  VISIT_NOTE_COPY,
  WELLBEING_SEEN,
} from './copy';
import { healthNoteRows } from './visit';
import { WELLBEING_BANNED } from './wellbeing.banned';

const TZ = 'America/Los_Angeles';
const at = (day: number, h: number, m = 0): number => zonedToUtc(TZ, 2026, 10, day, h, m);
const NOW = at(9, 12);
const RANGE = rangeOf('week', TZ, NOW);
const BUCKETS = dayBuckets(RANGE, TZ);
const NO_TIMERS: ActiveTimer[] = [];
const CLASSIFY = { timeZone: TZ, window: DEFAULT_DAY_WINDOW };

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `v${String(seq).padStart(3, '0')}`,
    childId: 'ada',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};
const meal = (startMs: number, ...foods: string[]) =>
  row({
    type: 'solids',
    startMs,
    solidsItems: foods.map(name => ({ name, amount: null, unit: null, response: null })),
  });

const fmt: VisitFormat = {
  volume: ml => `${Math.round(ml / 29.5735)} oz`,
  duration: min => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`,
  temperature: c => `${(c / 100).toFixed(1)} °C`,
  growth: (_m, v) => String(v),
  stamp: ms => `stamp:${new Date(ms).toISOString()}`,
  day: ms => `day:${new Date(ms).toISOString().slice(0, 10)}`,
};

/** The parent's example: sweet potato at 7 PM, a rash noticed the next morning at 10. */
const SWEET_POTATO = meal(at(7, 19), 'Sweet potato');
const BANANA_BEFORE = meal(at(1, 12), 'Banana');
const NOTE = row({
  type: 'wellbeing',
  startMs: at(8, 10),
  wellbeingSeen: ['RASH', 'SWELLING'],
  notes: 'Small red patches on her cheeks',
});
const ENDED = row({
  type: 'wellbeing',
  startMs: at(6, 15),
  endMs: at(6, 18),
  wellbeingSeen: [],
  notes: 'Very sleepy after the bath',
});
const ROWS: TodayActivity[] = [
  BANANA_BEFORE,
  SWEET_POTATO,
  row({ type: 'bottle', startMs: at(8, 6), consumedMl: 120 }),
  row({ type: 'bottle', startMs: at(7, 23), consumedMl: 90 }),
  row({ type: 'breastfeed', startMs: at(7, 14), endMs: at(7, 14, 20) }),
  row({ type: 'diaper', startMs: at(8, 7), diaperKind: 'DIRTY', diaperRash: true }),
  row({ type: 'diaper', startMs: at(8, 2), diaperKind: 'WET' }),
  row({ type: 'sleep', startMs: at(7, 20), endMs: at(8, 5), sleepKind: 'NIGHT' }),
  row({ type: 'temp', startMs: at(8, 9), tempCHundredths: 3720, tempMethod: 'Axillary' }),
  row({ type: 'med', startMs: at(7, 9), medName: 'Vitamin D', medAmount: '1 ml' }),
  row({ type: 'bath', startMs: at(7, 18) }),
  NOTE,
  ENDED,
];
const MEALS = ROWS.filter(r => r.type === 'solids').map(r => ({
  id: r.id,
  childId: r.childId,
  atMs: r.startMs,
  items: r.solidsItems ?? [],
}));

const build = (rows: TodayActivity[]): VisitSheet => {
  const series = reportSeries(rows, NO_TIMERS, RANGE, TZ, NOW);
  return visitSheet({
    childName: 'Ada',
    birthDate: '2026-04-01',
    ageLabel: '6 months',
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
    meals: MEALS,
  });
};
const section = (sheet: VisitSheet, key: string) => sheet.sections.find(s => s.key === key);

describe('the chips and the words', () => {
  it('are what was seen, in the sheet’s own order, never a condition', () => {
    expect(WELLBEING_SEEN.map(s => SEEN_LABEL[s])).toEqual([
      'Rash',
      'Swelling',
      'Spit up',
      'Loose diaper',
      'Cough',
      'Fussy',
      'Other',
    ]);
    for (const word of Object.values(SEEN_LABEL)) {
      for (const re of WELLBEING_BANNED) expect(word).not.toMatch(re);
      // temperature has its own module; a fever chip would be the app naming a reading
      expect(word.toLowerCase()).not.toContain('fever');
    }
  });

  it('reads the chips back in order, dropping a token it does not know and any repeat', () => {
    expect(seenOf('["COUGH","RASH","RASH","NOT_A_CHIP"]')).toEqual(['RASH', 'COUGH']);
    expect(seenOf(['FUSSY'])).toEqual(['FUSSY']);
    expect(seenOf('not json')).toEqual([]);
    expect(seenOf(null)).toEqual([]);
    expect(seenText(['RASH', 'SPIT_UP'])).toBe('Rash, spit up');
    expect(noteLine(['RASH'], ' On her cheeks ')).toBe('Rash · On her cheeks');
    expect(noteLine([], 'On her cheeks')).toBe('On her cheeks');
  });

  it('will not save an empty note: a chip or some words', () => {
    expect(noteProblem([], '  ')).not.toBeNull();
    expect(noteProblem(['RASH'], '')).toBeNull();
    expect(noteProblem([], 'sleepy')).toBeNull();
  });

  it('takes its name from the registry, so the fallback name is one line', () => {
    expect(NOTE_NAME).toBe('Health note');
    expect(NOTES_TITLE).toBe('Health notes');
    expect(NOTE_SUBTITLE).toBe('Something you noticed, in your own words');
  });
});

describe('the Health notes section of the pediatrician sheet', () => {
  it('lists each note newest first: start, end or none logged, chips, then the words verbatim', () => {
    const rows = healthNoteRows({ notes: [ENDED, NOTE], rows: ROWS, meals: MEALS, fmt });
    const heads = rows.filter(r => r.sub !== true);
    expect(heads.map(r => r.label)).toEqual([fmt.stamp(NOTE.startMs), fmt.stamp(ENDED.startMs)]);
    expect(heads[0]).toMatchObject({ value: 'Rash, swelling', note: VISIT_NOTE_COPY.noEnd });
    // a note in words alone shows its words where the chips would be, and its end
    expect(heads[1]).toMatchObject({
      value: 'Very sleepy after the bath',
      note: VISIT_NOTE_COPY.until(fmt.stamp(ENDED.endMs as number)),
    });
    expect(rows).toContainEqual({
      label: VISIT_NOTE_COPY.words,
      value: 'Small red patches on her cheeks',
      sub: true,
    });
  });

  it('carries the 48 hours before it: the food named and first time logged marked', () => {
    const rows = healthNoteRows({ notes: [NOTE], rows: ROWS, meals: MEALS, fmt });
    const label = (l: string) => rows.find(r => r.label === l);
    expect(label(VISIT_NOTE_COPY.before(48))).toMatchObject({ value: '11 entries', sub: true });
    expect(label(VISIT_NOTE_COPY.solids(fmt.stamp(SWEET_POTATO.startMs)))).toMatchObject({
      value: 'Sweet potato (first time logged)',
      sub: true,
    });
    // the medicine with the amount AS TYPED, never parsed (rule 4)
    expect(rows.find(r => r.value === 'Vitamin D · 1 ml')).toBeDefined();
    expect(label(VISIT_NOTE_COPY.temperature(fmt.stamp(at(8, 9))))).toMatchObject({
      value: '37.2 °C',
      note: 'axillary',
    });
    expect(label(VISIT_NOTE_COPY.feeds)?.value).toBe('2 bottles (7 oz) · 1 breastfeed');
    expect(label(VISIT_NOTE_COPY.diapers)).toMatchObject({
      value: '2 changes',
      note: '1 wet · 1 dirty · rash noted 1',
    });
    expect(label(VISIT_NOTE_COPY.sleep)?.value).toBe('1 sleep');
    expect(label(VISIT_NOTE_COPY.other)?.value).toBe('Bath 1');
    // banana was logged on the 1st: it is not in this window, and nothing calls it a first time
    expect(rows.some(r => r.value.includes('Banana'))).toBe(false);
  });

  it('keeps the sheet’s own section order under each note, whatever the entries say', () => {
    const rows = healthNoteRows({ notes: [NOTE], rows: ROWS, meals: MEALS, fmt });
    const fixed: readonly string[] = [
      VISIT_NOTE_COPY.sleep,
      VISIT_NOTE_COPY.feeds,
      VISIT_NOTE_COPY.diapers,
      VISIT_NOTE_COPY.other,
    ];
    const order = rows.map(r => r.label).filter(l => fixed.includes(l));
    expect(order).toEqual(fixed);
  });

  it('is on the sheet in its fixed place, in every rendering, beside the caveat', () => {
    const sheet = build(ROWS);
    const s = section(sheet, 'healthNotes');
    expect(s?.title).toBe('Health notes');
    expect(s?.rows.length).toBeGreaterThan(0);
    // the note's words are said once, in its own section, not again under the household's notes
    expect(section(sheet, 'notes')?.rows.some(r => r.value.includes('red patches'))).toBe(false);
    const text = visitSheetText(sheet);
    expect(text).toContain('HEALTH NOTES');
    expect(text).toContain('    - Solids · ');
    expect(text).toContain('Sweet potato (first time logged)');
    expect(text).toContain('Small red patches on her cheeks');
    expect(text).toContain(VISIT_CAVEAT);
    const html = printableHtml(sheet);
    expect(html).toContain('Health notes');
    expect(html).toContain('Sweet potato (first time logged)');
    expect(html).toContain('Small red patches on her cheeks');
  });

  it('says plainly when there are none', () => {
    const sheet = build(ROWS.filter(r => r.type !== 'wellbeing'));
    expect(section(sheet, 'healthNotes')).toMatchObject({
      rows: [],
      empty: 'No health notes in this period.',
    });
  });

  it('interprets nothing: no banned word in any row it draws', () => {
    const sheet = build(ROWS);
    for (const r of section(sheet, 'healthNotes')?.rows ?? []) {
      const line = `${r.label} ${r.value} ${r.note ?? ''}`;
      expect(reportBannedHits(line), line).toEqual([]);
      // the parent's own words are theirs; every other word on the row is the app's
      if (r.label === VISIT_NOTE_COPY.words) continue;
      for (const re of WELLBEING_BANNED) expect(line, line).not.toMatch(re);
    }
  });

  it('counts the notes past twelve rather than dropping them', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      row({ type: 'wellbeing', startMs: at(8, 10) - i * 3_600_000, wellbeingSeen: ['COUGH'] }),
    );
    const rows = healthNoteRows({ notes: many, rows: many, meals: [], fmt });
    expect(rows.at(-1)).toMatchObject({ label: VISIT_NOTE_COPY.more, value: '+2' });
  });
});
