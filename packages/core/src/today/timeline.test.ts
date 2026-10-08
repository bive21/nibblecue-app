import { describe, expect, it } from 'vitest';
import { zonedToUtc } from './day';
import type { TodayActivity } from './rows';
import { dayHeading, nextCursor, TIMELINE_PAGE, timelineGroups } from './timeline';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);

let seq = 0;
function row(
  over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>,
): TodayActivity {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  };
}

describe('dayHeading', () => {
  it('names today and yesterday', () => {
    expect(dayHeading('2026-09-14', NOON, TZ)).toBe('Today');
    expect(dayHeading('2026-09-13', NOON, TZ)).toBe('Yesterday');
  });

  it('spells out anything older', () => {
    expect(dayHeading('2026-09-09', NOON, TZ)).toBe('Wed Sep 9');
    expect(dayHeading('2026-09-08', NOON, TZ)).toBe('Tue Sep 8');
  });

  it('gets yesterday right across a DST boundary, where a day is not 24 hours', () => {
    // 2026-11-01 is a 25-hour day in Los Angeles; the 2nd's "yesterday" is still the 1st
    const nov2 = zonedToUtc(TZ, 2026, 11, 2, 12);
    expect(dayHeading('2026-11-01', nov2, TZ)).toBe('Yesterday');
    expect(dayHeading('2026-11-02', nov2, TZ)).toBe('Today');
  });

  it('is relative to the household zone, not the reader’s', () => {
    // 22:30 on the 14th in LA is already the 15th in Auckland
    const at2230 = at(22, 30);
    expect(dayHeading('2026-09-14', at2230, TZ)).toBe('Today');
    expect(dayHeading('2026-09-14', at2230, 'Pacific/Auckland')).toBe('Yesterday');
  });
});

describe('timelineGroups', () => {
  it('groups by local day, newest day first and newest row first inside a day', () => {
    const rows = [
      row({ type: 'bottle', startMs: at(8) }),
      row({ type: 'diaper', startMs: at(11), diaperKind: 'WET' }),
      row({ type: 'bottle', startMs: at(20, 0, 13) }),
    ];
    const groups = timelineGroups(rows, NOON, TZ);

    expect(groups.map(g => g.dayKey)).toEqual(['2026-09-14', '2026-09-13']);
    expect(groups.map(g => g.heading)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]?.rows.map(r => r.startMs)).toEqual([at(11), at(8)]);
  });

  it('splits an entry at 23:50 and one at 00:10 into two days', () => {
    const rows = [
      row({ type: 'note', startMs: at(23, 50, 13) }),
      row({ type: 'note', startMs: at(0, 10) }),
    ];
    expect(timelineGroups(rows, NOON, TZ).map(g => g.dayKey)).toEqual(['2026-09-14', '2026-09-13']);
  });

  it('files an entry by the household zone, so two households group it differently', () => {
    const rows = [row({ type: 'note', startMs: at(22, 30) })];
    expect(timelineGroups(rows, NOON, TZ)[0]?.dayKey).toBe('2026-09-14');
    expect(timelineGroups(rows, NOON, 'Pacific/Auckland')[0]?.dayKey).toBe('2026-09-15');
  });

  it('returns nothing for no rows rather than an empty day', () => {
    expect(timelineGroups([], NOON, TZ)).toEqual([]);
  });
});

describe('nextCursor — pagination is by time, never by offset (D14)', () => {
  const page = (n: number): TodayActivity[] =>
    Array.from({ length: n }, (_, i) => row({ type: 'note', startMs: at(12) - i * 60_000 }));

  it('returns the oldest start on a full page', () => {
    const p = page(TIMELINE_PAGE);
    expect(nextCursor(p)).toBe(p[p.length - 1]?.startMs);
  });

  it('returns null on a short page, so the end is known without another round trip', () => {
    expect(nextCursor(page(TIMELINE_PAGE - 1))).toBeNull();
    expect(nextCursor([])).toBeNull();
  });
});
