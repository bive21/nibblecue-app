import { zonedToUtc, type LookBackItem, type TodayActivity } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { END_AFTER_NOW, END_BEFORE_START } from '../../../entry/editor';
import { dayLabel, endProblem, lookBackDays, movedToDay } from './noteForm';

const TZ = 'America/Los_Angeles';
const at = (day: number, h: number, m = 0): number => zonedToUtc(TZ, 2026, 10, day, h, m);
const NOW = at(8, 10, 30);

describe('the Health note sheet: when it started', () => {
  it('moves the start to another day at the same clock time', () => {
    // the parent's example, written two days on: 7 PM, on the 6th
    expect(movedToDay('2026-10-06', at(8, 19), NOW, TZ)).toBe(at(6, 19));
  });

  it('never moves it later than now', () => {
    expect(movedToDay('2026-10-08', at(7, 23), NOW, TZ)).toBe(NOW);
  });

  it('names the day the way the Log does', () => {
    expect(dayLabel(at(8, 9), NOW, TZ)).toBe('Today');
    expect(dayLabel(at(7, 19), NOW, TZ)).toBe('Yesterday');
  });
});

describe('the Health note sheet: when it stopped', () => {
  it('still going is always fine', () => {
    expect(endProblem(at(8, 9), null, NOW)).toBeNull();
  });
  it('a stop before the start, or later than now, is said and not saved', () => {
    expect(endProblem(at(8, 9), at(8, 8), NOW)).toBe(END_BEFORE_START);
    expect(endProblem(at(8, 9), at(8, 12), NOW)).toBe(END_AFTER_NOW);
    expect(endProblem(at(8, 9), at(8, 10), NOW)).toBeNull();
  });
});

describe('the look back, in days', () => {
  const item = (id: string, startMs: number): LookBackItem =>
    ({
      entry: {
        id,
        childId: 'ada',
        type: 'bottle',
        startMs,
        endMs: null,
        isPrivate: false,
        createdBy: 'u',
      } as TodayActivity,
      firstTimeFoods: [],
    }) as LookBackItem;

  it('keeps core’s order (oldest first) and only draws the days around it', () => {
    const days = lookBackDays(
      [item('a', at(6, 20)), item('b', at(7, 19)), item('c', at(7, 23)), item('d', at(8, 6))],
      NOW,
      TZ,
    );
    expect(days.map(d => d.items.map(i => i.entry.id))).toEqual([['a'], ['b', 'c'], ['d']]);
    expect(days.map(d => d.heading).slice(1)).toEqual(['Yesterday', 'Today']);
  });
});
