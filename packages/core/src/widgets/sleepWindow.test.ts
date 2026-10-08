/**
 * The sleep window's states (the owner's handoff, 2026-10-08), from its own fixtures: the selected
 * example's arithmetic, each boundary, a point estimate's honest "Around", and nothing invented.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from '../schedule/foresight.banned';
import { SLEEP_WINDOW_COPY, sleepWindowState, untilWords } from './sleepWindow';

const T = (hh: number, mm: number, ss = 0) => Date.UTC(2026, 9, 7, hh + 4, mm, ss); // New York, EDT
const WAKE = T(12, 30);
const bounded = {
  state: 'awake',
  awakeSinceMs: WAKE,
  nextAtMs: T(14, 25),
  nextKind: 'nap' as const,
  gap: false,
  windowStartMs: T(14, 15),
  windowEndMs: T(14, 35),
};
const point = {
  state: 'awake',
  awakeSinceMs: WAKE,
  nextAtMs: T(14, 20),
  nextKind: 'nap' as const,
  gap: false,
};

describe('a bounded window', () => {
  it('the selected example: 70 min awake, 35 min to go, marker 0.56, band from 0.84', () => {
    const v = sleepWindowState(bounded, T(13, 40))!;
    expect(v).toMatchObject({
      phase: 'before',
      status: 'In 35 min',
      compact: '35m',
      awakeMinutes: 70,
      action: 'start',
      mode: 'window',
    });
    expect(v.rail!.marker).toBeCloseTo(0.56, 2);
    expect(v.rail!.bandStart).toBeCloseTo(0.84, 2);
  });

  it('under a minute is "<1 min", never 0 or an early window', () => {
    expect(sleepWindowState(bounded, T(14, 14, 15))).toMatchObject({
      phase: 'before',
      status: 'In <1 min',
      compact: '<1m',
    });
  });

  it('both ends of the window are "Window now", with Start sleep', () => {
    expect(sleepWindowState(bounded, T(14, 15))).toMatchObject({
      phase: 'open',
      status: 'Window now',
      compact: 'Now',
      action: 'start',
    });
    expect(sleepWindowState(bounded, T(14, 35))).toMatchObject({ phase: 'open' });
  });

  it('past it: "Window has passed", Update sleep, no rail — and gone after the grace', () => {
    expect(sleepWindowState(bounded, T(14, 36))).toMatchObject({
      phase: 'passed',
      status: 'Window has passed',
      action: 'update',
      rail: null,
    });
    expect(sleepWindowState(bounded, T(14, 51))).toBeNull();
  });

  it('invalid bounds are not a window: they fall back to the point', () => {
    expect(sleepWindowState({ ...bounded, windowStartMs: T(14, 40) }, T(13, 40))).toMatchObject({
      mode: 'point',
      rail: null,
    });
  });
});

describe('a point estimate', () => {
  it('counts down to it, with no rail and no invented range', () => {
    expect(sleepWindowState(point, T(13, 40))).toMatchObject({
      mode: 'point',
      status: 'In 40 min',
      rail: null,
    });
  });
  it('at and after it: "Check sleep", Update sleep', () => {
    expect(sleepWindowState(point, T(14, 20))).toMatchObject({
      phase: 'passed',
      status: 'Check sleep',
      action: 'update',
    });
  });
});

describe('nothing invented', () => {
  it('asleep, a gap, no estimate or the night with no time: nothing', () => {
    expect(sleepWindowState({ ...point, state: 'asleep' }, T(13, 40))).toBeNull();
    expect(sleepWindowState({ ...point, gap: true }, T(13, 40))).toBeNull();
    expect(sleepWindowState({ ...point, nextAtMs: null }, T(13, 40))).toBeNull();
    expect(sleepWindowState({ ...point, nextKind: null }, T(13, 40))).toBeNull();
  });

  it('rounds up, and keeps hours with minutes', () => {
    expect(untilWords(34 * 60_000 + 1).long).toBe('35 min');
    expect(untilWords(65 * 60_000).long).toBe('1h 5m');
  });

  it('says nothing about the baby’s state', () => {
    const words = [
      SLEEP_WINDOW_COPY.identity('nap', 'Ada'),
      SLEEP_WINDOW_COPY.identity('night', 'Ada'),
      SLEEP_WINDOW_COPY.around('2:20 PM'),
      'Window now',
      'Window has passed',
      'Check sleep',
      SLEEP_WINDOW_COPY.startSleep,
      SLEEP_WINDOW_COPY.updateSleep,
    ]
      .join(' ')
      .toLowerCase();
    for (const w of BANNED) expect(words.includes(w), w).toBe(false);
  });
});
