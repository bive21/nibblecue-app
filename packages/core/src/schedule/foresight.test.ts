import { describe, expect, it } from 'vitest';
import {
  foresee,
  headsUpAt,
  leadFor,
  LEAD_MAX_MS,
  LEAD_MIN_MS,
  MERGE_MS,
  MIN_SAMPLES,
  rhythms,
  zoneClock,
  type Beat,
} from './foresight';
import { BANNED } from './foresight.banned';
import { foresightGap, manyLine, manyTitle, oneLine, oneTitle } from './foresight.copy';

const H = 60 * 60_000;
const M = 60_000;
const NOW = Date.parse('2026-09-18T18:00:00.000Z');

/** `n` starts of one activity, `gap` apart, ending `endsAgo` before now. */
const run = (activity: string, n: number, gap: number, endsAgo = 0): Beat[] =>
  Array.from({ length: n }, (_, i) => ({
    activity,
    startMs: NOW - endsAgo - (n - 1 - i) * gap,
  }));

describe('the household’s own rhythm', () => {
  it('is the median gap, and says how many gaps it came from', () => {
    const r = rhythms(run('sleep', 7, 3 * H), NOW);
    expect(r).toHaveLength(1);
    expect(r[0]?.medianGapMs).toBe(3 * H);
    expect(r[0]?.samples).toBe(6);
    expect(r[0]?.nextAtMs).toBe(NOW + 3 * H);
  });

  it('takes the MEDIAN, so one forgotten entry does not drag the answer', () => {
    // six three-hour gaps and one seven-hour one: the mean is 3h 34m, the median is 3h
    const starts = [0, 3, 6, 9, 12, 15, 22].map(h => ({
      activity: 'bottle',
      startMs: NOW - (22 - h) * H,
    }));
    const r = rhythms(starts, NOW);
    expect(r[0]?.medianGapMs).toBe(3 * H);
  });

  it('says nothing at all below the sample floor', () => {
    // n entries make n − 1 gaps, and it is GAPS that are counted
    expect(rhythms(run('pump', MIN_SAMPLES + 1, 2 * H), NOW)).toHaveLength(1);
    expect(rhythms(run('pump', MIN_SAMPLES, 2 * H), NOW)).toHaveLength(0);
  });

  it('drops a night from the gaps rather than averaging it in', () => {
    // a nine-hour overnight gap is an exception to a three-hour rhythm, not part of it
    const day = run('bottle', 5, 3 * H, 12 * H);
    const afterNight = run('bottle', 5, 3 * H);
    const r = rhythms([...day, ...afterNight], NOW);
    expect(r[0]?.medianGapMs).toBe(3 * H);
  });

  it('ignores a correction logged minutes after the thing it corrects', () => {
    const beats = [...run('diaper', 6, 4 * H), { activity: 'diaper', startMs: NOW + 1 }];
    const r = rhythms(beats, NOW);
    expect(r[0]?.medianGapMs).toBe(4 * H);
  });
});

/**
 * THE RULES THE BACKTEST CHOSE (2026-09-23, `foresight.backtest.test.ts`), each on a log small
 * enough to check by hand.
 */
describe('what the measured engine does', () => {
  const DAY = 24 * H;
  /** Days of the same clock times, ending on the day NOW falls in. */
  const days = (activity: string, count: number, hours: readonly number[]): Beat[] => {
    const midnight = NOW - (NOW % DAY);
    const out: Beat[] = [];
    for (let d = count - 1; d >= 0; d -= 1) {
      for (const h of hours) {
        const at = midnight - d * DAY + h * H;
        if (at <= NOW) out.push({ activity, startMs: at });
      }
    }
    return out;
  };

  it('counts a bottle and a breastfeed as one rhythm of feeds, named by the last one', () => {
    // a mostly-breastfed baby with a bottle every other feed: feeds every 3h, bottles every 6h
    const beats = run('breastfeed', 9, 3 * H).map((b, i) =>
      i % 2 === 1 ? { ...b, activity: 'bottle' } : b,
    );
    const r = rhythms(beats, NOW);
    expect(r).toHaveLength(1);
    expect(r[0]?.medianGapMs).toBe(3 * H);
    expect(r[0]?.activity).toBe(beats[beats.length - 1]?.activity);
  });

  it('treats a top-up bottle twenty minutes into a breastfeed as the same feed', () => {
    const feeds = run('breastfeed', 7, 3 * H);
    const topUps = feeds
      .slice(0, -1)
      .map(b => ({ activity: 'bottle', startMs: b.startMs + 20 * M }));
    const r = rhythms([...feeds, ...topUps], NOW);
    expect(r[0]?.medianGapMs).toBe(3 * H);
    expect(r[0]?.samples).toBeGreaterThanOrEqual(MIN_SAMPLES);
  });

  it('after the bedtime feed, expects the morning one rather than a feed in the night', () => {
    // feeds at 7, 10, 13, 16 and 19 (UTC here), and nothing until 7 the next morning
    const beats = days('bottle', 6, [7, 10, 13, 16, 19]).filter(b => b.startMs <= NOW - 23 * H);
    const bedtime = Math.max(...beats.map(b => b.startMs));
    const r = rhythms(beats, bedtime);
    expect(r[0]?.medianGapMs).toBe(12 * H);
    expect(r[0]?.nextAtMs).toBe(bedtime + 12 * H);
  });

  it('in the afternoon, still expects the daytime gap', () => {
    const beats = days('bottle', 6, [7, 10, 13, 16, 19]).filter(b => b.startMs <= NOW - 5 * H);
    const last = Math.max(...beats.map(b => b.startMs)); // 13:00
    expect(rhythms(beats, last)[0]?.nextAtMs).toBe(last + 3 * H);
  });

  /**
   * THE FORGOTTEN ENTRY (the owner, 2026-09-26: "consider the human aspect of like forget to
   * logging"). A day nobody logged is a gap of a day and more, past every limit a gap is read
   * under; a feed never logged is one doubled gap among many; a feed logged hours late, at the time
   * it was written, is one long gap and one short one. The middle of the household's own gaps
   * stays where the feeds really are, and the next one is expected where it really falls.
   */
  it('keeps the rhythm through a day nobody logged, a feed never logged and a feed logged late', () => {
    const beats = days('bottle', 8, [7, 10, 13, 16, 19])
      // the fifth day before today, nobody logged anything
      .filter(b => Math.floor((NOW - b.startMs) / DAY) !== 5)
      // yesterday's 10 o'clock feed never reached the log
      .filter(b => b.startMs !== NOW - (NOW % DAY) - DAY + 10 * H)
      // and the day before's one o'clock feed was logged at three, when somebody remembered
      .map(b =>
        b.startMs === NOW - (NOW % DAY) - 2 * DAY + 13 * H
          ? { ...b, startMs: b.startMs + 2 * H }
          : b,
      )
      .filter(b => b.startMs <= NOW - 5 * H);
    const last = Math.max(...beats.map(b => b.startMs)); // today's 13:00
    const r = rhythms(beats, last);
    expect(r[0]?.medianGapMs).toBe(3 * H);
    expect(r[0]?.nextAtMs).toBe(last + 3 * H);
  });

  it('leans on the last few days when the gaps are lengthening', () => {
    // five days at 3h, then five days at 3h30m: the answer follows the baby, not the fortnight
    const old = run('bottle', 40, 3 * H, 5 * DAY);
    const recent = run('bottle', 33, 3.5 * H);
    const r = rhythms([...old, ...recent], NOW);
    expect(r[0]?.medianGapMs).toBe(3.5 * H);
  });

  it('never plans a pump for a weekend when the pumping only ever happens on weekdays', () => {
    // two weeks of pumps at 10, 13 and 16 on weekdays; NOW is a Friday
    const friday = NOW - (NOW % DAY) + 16 * H;
    expect(new Date(friday).getUTCDay()).toBe(5);
    const beats = days('pump', 14, [10, 13, 16]).filter(b => {
      const day = new Date(b.startMs).getUTCDay();
      return day !== 0 && day !== 6 && b.startMs <= friday;
    });
    const r = rhythms(beats, friday);
    const next = new Date(r[0]?.nextAtMs ?? 0);
    expect(next.getUTCDay()).toBe(1); // Monday
    expect(next.getUTCHours()).toBe(10);
  });

  it('reads the time of day on the phone’s clock', () => {
    const paris = zoneClock('Europe/Paris');
    // 18:00 UTC in September is 20:00 in Paris
    expect(paris.minuteOfDay(NOW)).toBe(20 * 60);
    expect(paris.weekend(Date.parse('2026-09-19T12:00:00.000Z'))).toBe(true);
    expect(paris.weekend(NOW)).toBe(false);
  });
});

describe('when the phone raises it', () => {
  it('warns by a share of the gap, floored and capped', () => {
    expect(leadFor(3 * H)).toBe(15 * M); // the owner's own example: 2h45m into a 3h rhythm
    expect(leadFor(30 * M)).toBe(LEAD_MIN_MS);
    expect(leadFor(12 * H)).toBe(LEAD_MAX_MS);
  });

  it('never raises one that is already in the past', () => {
    const r = rhythms(run('sleep', 6, 3 * H, 4 * H), NOW);
    expect(foresee(r, NOW)).toHaveLength(0);
  });

  it('folds two that fall together into one, at the earlier time', () => {
    // "if there are 2 activities schedule around the same time, then the notifications should be
    // 2 in one" — a feed and a pump ten minutes apart is one buzz, not two
    const feeds = rhythms(run('bottle', 6, 3 * H), NOW);
    // a slightly longer rhythm, so its next falls ten minutes after the feed's
    const pumps = rhythms(run('pump', 6, 3 * H + 10 * M), NOW);
    const all = [...feeds, ...pumps];
    const seen = foresee(all, NOW);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.activities.sort()).toEqual(['bottle', 'pump']);
    expect(seen[0]?.atMs).toBe(Math.min(...all.map(r => r.nextAtMs - leadFor(r.medianGapMs))));
  });

  it('keeps two apart when they are genuinely apart', () => {
    const a = rhythms(run('bottle', 6, 3 * H), NOW);
    const b = rhythms(run('bath', 6, 3 * H + MERGE_MS + 20 * M), NOW);
    expect(foresee([...a, ...b], NOW)).toHaveLength(2);
  });

  /*
    A RHYTHM THAT FIXES ITS OWN LEAD (2026-09-28): the nap outlook's, fifteen minutes whatever the
    stretch (`napAsRhythm`). The share of the gap would be ten before a two-hour stretch awake.
  */
  it('uses a rhythm’s own lead where it has one, and merges by it', () => {
    const shared = {
      activity: 'sleep',
      medianGapMs: 2 * H,
      samples: 9,
      lastAtMs: NOW - H,
      nextAtMs: NOW + H,
    };
    const nap = { ...shared, leadMs: 15 * M };
    expect(leadFor(2 * H)).toBe(10 * M);
    expect(headsUpAt(nap)).toBe(NOW + 45 * M);
    expect(headsUpAt(shared)).toBe(NOW + 50 * M);
    const seen = foresee([nap], NOW);
    expect(seen.map(f => f.atMs)).toEqual([NOW + 45 * M]);
    // a feed whose own heads-up is at 1:05 folds into the nap's at 12:45 — twenty minutes apart
    const feed = {
      activity: 'bottle',
      medianGapMs: 3 * H,
      samples: 12,
      lastAtMs: NOW - 2 * H,
      nextAtMs: NOW + H + 20 * M,
    };
    const both = foresee([feed, nap], NOW);
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ atMs: NOW + 45 * M, activities: ['sleep', 'bottle'] });
  });
});

describe('what it is allowed to say', () => {
  const all = [
    oneTitle('Ada', 'sleep'),
    oneLine('Ada', 'sleep', 3 * H + 5 * M, 12),
    manyTitle('Ada', ['bottle', 'pump']),
    manyTitle('Ada', ['bottle', 'sleep']),
    manyLine('Ada', [
      { activity: 'bottle', gapMs: 3 * H, samples: 12 },
      { activity: 'pump', gapMs: 3 * H, samples: 9 },
    ]),
  ].join(' \n ');

  it('describes the household’s own numbers and diagnoses nothing', () => {
    // the narrow line the rules were protecting: no condition, no judgement, no instruction
    for (const word of BANNED) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
  });

  it('always shows how many entries it came from', () => {
    expect(oneLine('Ada', 'sleep', 3 * H, 12)).toContain('the last 12');
    // and a merged line reports the THINNEST of them, so it cannot overclaim
    expect(
      manyLine('Ada', [
        { activity: 'bottle', gapMs: 3 * H, samples: 12 },
        { activity: 'pump', gapMs: 3 * H, samples: 9 },
      ]),
    ).toContain('the last 9');
  });

  /**
   * A PUMP IS NOT THE BABY'S. The engine treats pump, hydration and self-care as the household's
   * the way the schedule's rules do, and the copy has to agree: "Ada usually has a pump about
   * now" is a sentence about the wrong person, and a parent reading it at 5 a.m. would be right
   * to trust the app slightly less afterwards.
   */
  it('says “you” for the parent’s own activities and the baby’s name for the baby’s', () => {
    expect(oneLine('Ada', 'pump', 3 * H, 9)).toBe(
      'You usually have a pump about now: every 3h over the last 9.',
    );
    expect(oneTitle('Ada', 'pump')).toBe('A pump?');
    expect(oneLine('Ada', 'sleep', 3 * H, 9)).toBe(
      'Ada usually has a sleep about now: every 3h over the last 9.',
    );
    expect(oneTitle('Ada', 'sleep')).toBe('A sleep for Ada?');
    // a merged one with both keeps the two subjects apart rather than picking the wrong one
    expect(
      manyLine('Ada', [
        { activity: 'bottle', gapMs: 3 * H, samples: 12 },
        { activity: 'pump', gapMs: 2 * H, samples: 9 },
      ]),
    ).toBe(
      'Ada usually has a feed every 3h, and you usually have a pump every 2h, over the last 9 of each.',
    );
    expect(manyTitle('Ada', ['bottle', 'pump'])).toBe('2 things around now');
    expect(manyTitle('Ada', ['bottle', 'sleep'])).toBe('2 things around now for Ada');
  });

  it('says a gap longer than a rhythm as what it is, not as "every 11h"', () => {
    // the whole night after the bedtime feed, measured from the same time of day
    expect(oneLine('Ada', 'bottle', 11 * H, 5)).toBe(
      'Ada usually has a feed about now: 11h after the last one, over the last 5.',
    );
    expect(
      manyLine('Ada', [
        { activity: 'bottle', gapMs: 11 * H, samples: 5 },
        { activity: 'diaper', gapMs: 3 * H, samples: 9 },
      ]),
    ).toBe(
      'Ada usually has a feed 11h after the last one and a change every 3h, over the last 5 of each.',
    );
  });

  it('says the gap the way a parent says it', () => {
    expect(foresightGap(3 * H + 5 * M)).toBe('3h 05m');
    expect(foresightGap(3 * H)).toBe('3h');
    expect(foresightGap(45 * M)).toBe('45m');
  });
});
