import { describe, expect, it } from 'vitest';
import { reportBannedHits } from '../reports/observations';
import { dayBuckets, rangeOf } from '../reports/range';
import { zonedToUtc } from '../today/day';
import type { BottleKind, DiaperKind, TodayActivity } from '../today/rows';
import {
  allStoolLines,
  beyondOwnLine,
  blankDaysLine,
  CONFIDENT_WITHIN_HOURS,
  ENGAGED_MIN_DAYS,
  ENGAGED_MIN_ENTRIES,
  askAbout,
  allSentences,
  feedingMode,
  gapLabel,
  longestGapLine,
  ownPatternLine,
  perDayLine,
  agoSpanLabel,
  sinceLine,
  spacingFor,
  spanLabel,
  stoolPattern,
  STOOL_GUIDANCE_RETRIEVED,
  STOOL_GUIDANCE_VERIFIED,
  STOOL_NOT_ENGAGED,
  STOOL_STALE,
} from './index';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);
const WEEK = rangeOf('week', TZ, NOON);
const BUCKETS = dayBuckets(WEEK, TZ);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `s${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};
const diaper = (kind: DiaperKind, startMs: number) =>
  row({ type: 'diaper', startMs, diaperKind: kind });

describe('a household that does not log diapers is left alone', () => {
  it('says nothing at all with no diaper entries', () => {
    const p = stoolPattern([row({ type: 'bottle', startMs: at(9) })], BUCKETS, NOON);
    expect(p.engaged).toBe(false);
    expect(p.lastDirtyMs).toBeNull();
    expect(sinceLine(p)).toBeNull();
    expect(ownPatternLine(p)).toBeNull();
    expect(beyondOwnLine(p)).toBeNull();
  });

  it('needs three entries across two days before it speaks — two taps on one day is not tracking', () => {
    const oneDay = [diaper('WET', at(8)), diaper('DIRTY', at(9)), diaper('WET', at(10))];
    expect(oneDay).toHaveLength(ENGAGED_MIN_ENTRIES);
    expect(stoolPattern(oneDay, BUCKETS, NOON).engaged).toBe(false);

    const twoDays = [diaper('WET', at(8, 0, 13)), diaper('DIRTY', at(9)), diaper('WET', at(10))];
    const p = stoolPattern(twoDays, BUCKETS, NOON);
    expect(p.loggedDays).toBe(ENGAGED_MIN_DAYS);
    expect(p.engaged).toBe(true);
  });
});

describe('the gap is about the baby only while diapers are still being logged', () => {
  const stale = [
    diaper('DIRTY', at(9, 0, 8)),
    diaper('WET', at(11, 0, 8)),
    diaper('WET', at(9, 0, 9)),
  ];

  it('goes quiet once nothing has been logged for a day and a half', () => {
    const p = stoolPattern(stale, BUCKETS, NOON);
    expect(p.engaged).toBe(true);
    expect(p.daysSinceDirty).toBe(6);
    expect(p.confident).toBe(false);
    // the figure exists, and the sentence does not: six days is a fact about the LOG here
    expect(sinceLine(p)).toBeNull();
    expect(p.beyondOwnLongest).toBe(false);
  });

  it('keeps speaking while wet diapers are still arriving, even with no dirty one', () => {
    const rows = [
      diaper('DIRTY', at(9, 0, 11)),
      diaper('WET', at(11, 0, 11)),
      diaper('WET', at(9, 0, 13)),
      diaper('WET', at(8, 0, 14)),
    ];
    const p = stoolPattern(rows, BUCKETS, NOON);
    expect(p.confident).toBe(true);
    expect(p.daysSinceDirty).toBe(3);
    expect(sinceLine(p)).toContain('3 days');
  });

  it('draws the line at 36 hours, not 24 — a household that missed one night still counts', () => {
    const lastAt = NOON - 30 * 3_600_000;
    const rows = [
      diaper('DIRTY', at(9, 0, 12)),
      diaper('WET', at(10, 0, 12)),
      diaper('WET', lastAt),
    ];
    expect(CONFIDENT_WITHIN_HOURS).toBe(36);
    expect(stoolPattern(rows, BUCKETS, NOON).confident).toBe(true);
  });
});

describe('days since is floored, so "2 days" always means at least 48 hours', () => {
  it('26 hours is one day, not two', () => {
    const rows = [
      diaper('WET', at(8, 0, 12)),
      diaper('DIRTY', NOON - 26 * 3_600_000),
      diaper('WET', NOON - 2 * 3_600_000),
    ];
    const p = stoolPattern(rows, BUCKETS, NOON);
    expect(p.hoursSinceDirty).toBe(26);
    expect(p.daysSinceDirty).toBe(1);
  });

  it('knows whether today has had one', () => {
    const base = [diaper('WET', at(8, 0, 12)), diaper('WET', at(8, 0, 13))];
    expect(stoolPattern([...base, diaper('DIRTY', at(9))], BUCKETS, NOON).todayHasDirty).toBe(true);
    expect(
      stoolPattern([...base, diaper('DIRTY', at(9, 0, 13))], BUCKETS, NOON).todayHasDirty,
    ).toBe(false);
  });
});

describe("the flag is this baby's own history and nothing else", () => {
  // dirty at 09:00 on the 9th, 10th, 11th — three entries, two gaps of 24 h each
  const regular = [
    diaper('DIRTY', at(9, 0, 9)),
    diaper('DIRTY', at(9, 0, 10)),
    diaper('DIRTY', at(9, 0, 11)),
  ];

  it('needs two gaps before it has a pattern at all', () => {
    const two = stoolPattern(
      [...regular.slice(0, 2), diaper('WET', NOON - 3_600_000)],
      BUCKETS,
      NOON,
    );
    expect(two.gapsHours).toHaveLength(1);
    expect(two.hasOwnPattern).toBe(false);
    expect(two.beyondOwnLongest).toBe(false);
  });

  it('fires when the current gap passes every gap logged, and not before', () => {
    // still inside the 24 h they usually go: 09:00 on the 11th → 08:00 on the 12th is 23 h
    const inside = stoolPattern([...regular, diaper('WET', at(8, 0, 12))], BUCKETS, at(8, 0, 12));
    expect(inside.longestGapHours).toBe(24);
    expect(inside.beyondOwnLongest).toBe(false);

    const past = stoolPattern([...regular, diaper('WET', at(11, 0, 12))], BUCKETS, at(11, 0, 12));
    expect(past.beyondOwnLongest).toBe(true);
    expect(beyondOwnLine(past)).toContain('longer than any gap in this log so far');
  });

  it('never fires on a log that has simply stopped', () => {
    const p = stoolPattern(regular, BUCKETS, NOON);
    expect(p.confident).toBe(false);
    expect(p.beyondOwnLongest).toBe(false);
  });

  it('reports the household’s own middle gap rather than anybody’s rule', () => {
    const p = stoolPattern([...regular, diaper('WET', at(11, 0, 11))], BUCKETS, at(12, 0, 11));
    expect(p.medianGapHours).toBe(24);
    expect(ownPatternLine(p)).toBe('Dirty diapers have been about 1d apart, over 2 gaps.');
  });
});

describe('a quiet day is only a zero when something was logged that day', () => {
  it('counts days with diapers and no dirty one, and ignores days with nothing', () => {
    const rows = [
      diaper('DIRTY', at(9, 0, 12)),
      diaper('WET', at(9, 0, 13)),
      diaper('WET', at(9, 0, 14)),
    ];
    const p = stoolPattern(rows, BUCKETS, NOON);
    // the 8th to the 11th hold nothing at all and are not counted as blank
    expect(p.daysWithoutDirty).toBe(2);
    expect(p.loggedDays).toBe(3);
    expect(blankDaysLine(p)).toBe('2 days with diapers logged and no dirty one.');
  });

  it('counts BOTH once as wet and once as dirty', () => {
    const rows = [diaper('BOTH', at(9, 0, 13)), diaper('WET', at(10)), diaper('DRY', at(11))];
    const p = stoolPattern(rows, BUCKETS, NOON);
    expect(p.dirty).toBe(1);
    expect(p.wet).toBe(2);
    expect(p.dirtyByDay.at(-1)).toBe(0);
    expect(p.wetByDay.at(-1)).toBe(1);
    expect(p.diapersLogged).toBe(3);
  });
});

describe('which published sentence a household is shown', () => {
  const bottles = (kind: BottleKind, n: number) =>
    Array.from({ length: n }, (_, i) =>
      row({ type: 'bottle', startMs: at(6 + i), bottleKind: kind }),
    );

  it('reads the method off the log, and says nothing below five feeds', () => {
    expect(feedingMode(bottles('FORMULA', 4))).toBe('UNKNOWN');
    expect(feedingMode(bottles('FORMULA', 6))).toBe('FORMULA');
    expect(feedingMode(bottles('EBM', 6))).toBe('BREAST');
    expect(
      feedingMode(Array.from({ length: 6 }, (_, i) => row({ type: 'breastfeed', startMs: at(i) }))),
    ).toBe('BREAST');
    expect(feedingMode([...bottles('FORMULA', 3), ...bottles('EBM', 3)])).toBe('MIXED');
  });

  it('water and other are neither, so they cannot tip the reading', () => {
    expect(feedingMode([...bottles('WATER', 8), ...bottles('OTHER', 4)])).toBe('UNKNOWN');
  });

  it('never shows the formula frequency sentence to a household with no formula in its log', () => {
    const formulaQuote = spacingFor('FORMULA').map(s => s.quote);
    const daily = formulaQuote.find(q => q.includes('at least one bowel movement a day'));
    expect(daily).toBeTruthy();
    for (const mode of ['BREAST', 'UNKNOWN'] as const) {
      expect(spacingFor(mode).map(s => s.quote)).not.toContain(daily);
    }
    expect(spacingFor('MIXED').map(s => s.quote)).toContain(daily);
  });

  it('falls back to the two sentences that lower alarm when it cannot tell', () => {
    const quotes = spacingFor('UNKNOWN').map(s => s.quote);
    expect(quotes.some(q => q.includes('should not be considered a problem'))).toBe(true);
    expect(quotes.some(q => q.includes("isn't necessarily alarming"))).toBe(true);
  });
});

describe('the guidance file is quoted, sourced and dated', () => {
  it('gives every sentence a publication name and a url', () => {
    const all = allSentences();
    expect(all.length).toBeGreaterThan(4);
    for (const s of all) {
      expect(s.quote.length).toBeGreaterThan(20);
      expect(s.source.length).toBeGreaterThan(5);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });

  it('carries the ask-about list whole, each item with its own quote', () => {
    const items = askAbout();
    expect(items.map(i => i.id)).toEqual(['hard_dry', 'blood', 'rectal_bleeding', 'two_weeks']);
    for (const i of items) expect(i.quote.length).toBeGreaterThan(20);
  });

  it('is dated, and records that the owner has not yet confirmed the wording', () => {
    expect(STOOL_GUIDANCE_RETRIEVED).toBe('2026-09-17');
    // null until somebody opens each page and checks; the screens show the date either way
    expect(STOOL_GUIDANCE_VERIFIED).toBeNull();
  });

  it('holds no threshold number of days, because no source publishes one', () => {
    const text = JSON.stringify(spacingFor('MIXED'));
    expect(text).not.toMatch(/\b(after|more than|over)\s+\d+\s+days?\b/i);
  });
});

describe("the app's own sentences stay arithmetic", () => {
  const cases = [
    stoolPattern(
      [
        diaper('DIRTY', at(9, 0, 11)),
        diaper('DIRTY', at(9, 0, 12)),
        diaper('WET', at(10, 0, 12)),
        diaper('DIRTY', at(9, 0, 13)),
        diaper('WET', at(9)),
      ],
      BUCKETS,
      NOON,
    ),
    stoolPattern(
      [diaper('WET', at(9, 0, 13)), diaper('WET', at(9)), diaper('DRY', at(10))],
      BUCKETS,
      NOON,
    ),
    stoolPattern([], BUCKETS, NOON),
  ];

  it('passes the report banned-phrase lint on every line, at every sample size', () => {
    for (const p of cases) {
      for (const line of allStoolLines(p, 7)) {
        expect({ line, hits: reportBannedHits(line) }).toEqual({ line, hits: [] });
      }
    }
  });

  it('formats a length one way and a time ago the other', () => {
    expect(spanLabel(0)).toBe('under an hour');
    expect(spanLabel(1)).toBe('1 hour');
    expect(spanLabel(23)).toBe('23 hours');
    expect(spanLabel(24)).toBe('1 day');
    expect(spanLabel(50)).toBe('2 days, 2h');
    expect(agoSpanLabel(50)).toBe('2 days, 2h ago');
    expect(gapLabel(23.6)).toBe('1d');
    expect(gapLabel(5.2)).toBe('5h');
  });

  it('every average carries the number it is divided by', () => {
    const p = cases[0]!;
    expect(perDayLine(p, 7)).toBe('3 dirty diapers over 7 days, 0.4 a day.');
    expect(longestGapLine(p)).toBe('The longest gap logged so far was 1d.');
    expect(STOOL_STALE).toContain('no gap to count');
    expect(STOOL_NOT_ENGAGED).toContain('diaper changes have been logged');
  });
});
