import { describe, expect, it } from 'vitest';
import { MILK_GUIDANCE } from '../guidance';
import { planStashCrossings, STASH_NOTIFY_COPY } from './notify';

const TZ = 'America/New_York';
const DAY = 86_400_000;
// 2026-10-07, 7:00 AM in New York
const NOW = Date.UTC(2026, 9, 7, 11, 0);
const profile = MILK_GUIDANCE.CDC_US['2026_01'];
const TH = profile.notifications.bestUseThresholdsDays;
// noon on a day `n` days from today, New York
const dayOut = (n: number) => Date.UTC(2026, 9, 7, 16, 0) + n * DAY;

describe('planStashCrossings', () => {
  it('rings at 9:00 on the morning milk crosses a threshold, once for all of it', () => {
    const out = planStashCrossings({
      containers: [
        { bestUseAt: dayOut(7), ml: 120, frozen: true },
        { bestUseAt: dayOut(7), ml: 90, frozen: true },
        { bestUseAt: dayOut(12), ml: 150, frozen: true },
      ],
      thresholds: TH,
      timeZone: TZ,
      nowMs: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-10-07', threshold: 7, ml: 210, containers: 2 });
    expect(new Date(out[0]!.atMs).toISOString()).toBe('2026-10-07T13:00:00.000Z');
  });

  it('says nothing on the mornings in between: crossing, not inside', () => {
    const out = planStashCrossings({
      containers: [{ bestUseAt: dayOut(20), ml: 120, frozen: true }],
      thresholds: TH,
      timeZone: TZ,
      nowMs: NOW,
    });
    expect(out).toEqual([]);
  });

  it('plans tomorrow as well, and the nearest threshold wins a morning', () => {
    const out = planStashCrossings({
      containers: [
        { bestUseAt: dayOut(1), ml: 60, frozen: false },
        { bestUseAt: dayOut(31), ml: 100, frozen: true },
      ],
      thresholds: TH,
      timeZone: TZ,
      nowMs: NOW,
    });
    expect(out.map(c => [c.date, c.threshold, c.ml])).toEqual([['2026-10-08', 0, 60]]);
    // …and the 30-day crossing tomorrow gave way to the day itself
  });

  it('never announces milk already past its date, and skips a morning already gone', () => {
    const out = planStashCrossings({
      containers: [{ bestUseAt: dayOut(-3), ml: 60, frozen: true }],
      thresholds: TH,
      timeZone: TZ,
      nowMs: NOW,
    });
    expect(out).toEqual([]);
    const late = planStashCrossings({
      containers: [{ bestUseAt: dayOut(7), ml: 60, frozen: true }],
      thresholds: TH,
      timeZone: TZ,
      nowMs: NOW + 4 * 3_600_000,
    });
    expect(late).toEqual([]);
  });
});

describe('STASH_NOTIFY_COPY', () => {
  it('is the guidance file’s template, and says none of its banned words', () => {
    expect(STASH_NOTIFY_COPY.body('12 oz', { threshold: 7, frozenOnly: true })).toBe(
      '12 oz of frozen milk is approaching its best-use date, in 7 days.',
    );
    expect(STASH_NOTIFY_COPY.body('2 oz', { threshold: 0, frozenOnly: false })).toBe(
      '2 oz of stored milk reaches its best-use date today.',
    );
    const all = [
      STASH_NOTIFY_COPY.title,
      STASH_NOTIFY_COPY.body('x', { threshold: 0, frozenOnly: true }),
      STASH_NOTIFY_COPY.body('x', { threshold: 30, frozenOnly: false }),
    ]
      .join(' ')
      .toLowerCase();
    for (const word of profile.display.neverSay) expect(all).not.toContain(word);
  });
});
