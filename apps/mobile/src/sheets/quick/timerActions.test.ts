/**
 * WHAT THE TIMER ACTIONS WRITE, after the audit of 2026-09-24: the word a sleep is saved with
 * (care C2, C3), what a pause keeps (feeding C9), where Switch goes, and what "Correct the start
 * time" moves on a breastfeed (feeding C10). The arithmetic is `timerMath.test.ts`; this holds the
 * hook, the running panel and Today to it, by their source.
 */
import { DEFAULT_DAY_WINDOW } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { windowOfRow } from './timerMath';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

const actions = code('useTimerActions.ts');
// (CuddleCue's running panel and Today, which draw a timer's controls, are not in NibbleCue: only
// the actions' own checks are kept)

describe('a sleep is saved as the nap or night its start says, at the stop (care C2, C3)', () => {
  it('reads the household window and the start as it is when the timer stops', () => {
    expect(actions).toContain(
      'const window = windowOfRow(await dayWindowRow(db, write.householdId));',
    );
    expect(actions).toContain(
      'const kind = timerSleepKind(timer, currentTimeZone(), window, nowMs);',
    );
    // never the word stored when the timer started — absent on a coin's, stale after a correction
    expect(actions).not.toContain('sleepKindOf(timer)');
  });

  it('reads a stored window the way the rest of the app does, and the default without one', () => {
    expect(windowOfRow(null)).toEqual(DEFAULT_DAY_WINDOW);
    expect(windowOfRow({ wake_time: '08:00:00', bed_time: '21:15' })).toEqual({
      wake: '08:00',
      bed: '21:15',
    });
    expect(windowOfRow({ wake_time: null, bed_time: 'nonsense' })).toEqual(DEFAULT_DAY_WINDOW);
  });
});

describe('pause keeps the side, resume goes back to it (feeding C9)', () => {
  it('closes the open run and leaves active_side alone', () => {
    const pause = actions.slice(actions.indexOf('const pause = useCallback('));
    const patch = pause.slice(
      pause.indexOf('patch: {'),
      pause.indexOf('},', pause.indexOf('patch: {')),
    );
    expect(patch).toContain('side_started_at: null');
    expect(patch).not.toContain('active_side');
  });

  it('switches to the side the button names', () => {
    expect(actions).toContain('to: switchTarget(timer),');
  });
});

describe('correcting a feed’s start moves its minutes (feeding C10)', () => {
  it('works the sides out and writes them with the start, in one patch', () => {
    expect(actions).toContain('const c = startCorrection(timer, startedAtMs, Date.now());');
    expect(actions).toContain('leftSeconds: c.sides.leftSeconds,');
    const data = readFileSync(join(here, '../../data/timers.ts'), 'utf8');
    expect(data).toContain('patch.left_seconds = input.sides.leftSeconds;');
    expect(data).toContain('patch.side_started_at = input.sides.sideStartedAt;');
  });
});
