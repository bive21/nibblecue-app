/**
 * THE RUNNING TIMERS AS ONE STACK (the owner, 2026-09-26 and 2026-09-27; `timerStack.ts` has their
 * words): the order they started in, the two cards and the rows, the rows' words, and — as
 * tripwires over the source, since node cannot render React Native — what a row is and is not
 * (`AlsoRunning.tsx`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hit } from '../theme/theme';
import type { TimerType } from './StopButton';
import * as stackModule from './timerStack';
import {
  ALSO_RUNNING,
  ALSO_RUNNING_TITLE,
  alsoRunningHeight,
  alsoRunningSpoken,
  alsoRunningTitle,
  byStart,
  HERO_CARDS,
  stackOrder,
  timerStack,
  type StackTimer,
} from './timerStack';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const KINDS: readonly TimerType[] = ['breastfeed', 'pump', 'sleep', 'tummy'];
type Running = StackTimer & { type: TimerType };
let next = 0;
const timer = (type: TimerType, startedAtMs = 1000, id = `t${(next += 1)}`): Running => ({
  id,
  type,
  startedAtMs,
});

/** Every way of running `n` timers at once, a kind repeated for twins and triplets. */
function multisets(n: number, from = 0): TimerType[][] {
  if (n === 0) return [[]];
  const out: TimerType[][] = [];
  for (let i = from; i < KINDS.length; i += 1)
    for (const rest of multisets(n - 1, i)) out.push([KINDS[i] as TimerType, ...rest]);
  return out;
}

/** Every order of a list. */
function orders<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((x, i) =>
    orders([...list.slice(0, i), ...list.slice(i + 1)]).map(o => [x, ...o]),
  );
}

describe('the order: the one started first, first', () => {
  it('whatever the kinds — a feed started last is last', () => {
    // started playtime, then a sleep, then a pump, then a feed: that is the order drawn
    const order = stackOrder([
      timer('breastfeed', 400),
      timer('pump', 300),
      timer('tummy', 100),
      timer('sleep', 200),
    ]);
    expect(order.map(t => t.type)).toEqual(['tummy', 'sleep', 'pump', 'breastfeed']);
  });

  it('is the same order for twins as for anything else', () => {
    const liam = timer('sleep', 5_000, 'liam');
    const emma = timer('sleep', 2_000, 'emma');
    expect(stackOrder([liam, emma]).map(t => t.id)).toEqual(['emma', 'liam']);
    const a = timer('tummy', 30, 'a');
    const b = timer('tummy', 10, 'b');
    const c = timer('tummy', 20, 'c');
    expect(stackOrder([a, b, c]).map(t => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a tie by id, so two phones draw the same stack — twins started by one tap on Both', () => {
    const x = timer('sleep', 1_000, 'x');
    const y = timer('sleep', 1_000, 'y');
    expect(stackOrder([y, x]).map(t => t.id)).toEqual(['x', 'y']);
    expect(stackOrder([x, y]).map(t => t.id)).toEqual(['x', 'y']);
    expect(byStart(x, x)).toBe(0);
  });

  it('leaves the caller’s list as it was', () => {
    const list = [timer('tummy', 20), timer('breastfeed', 10)];
    const copy = [...list];
    stackOrder(list);
    expect(list).toEqual(copy);
  });

  it('holds for every combination of kinds and every order they arrive in, twins and triplets too', () => {
    for (const n of [1, 2, 3, 4])
      for (const kinds of multisets(n))
        for (const arrived of orders(kinds.map((type, i) => timer(type, 1_000 * (i + 1))))) {
          const order = stackOrder(arrived);
          for (let i = 1; i < order.length; i += 1)
            expect(order[i - 1]?.startedAtMs ?? 0, kinds.join(' ')).toBeLessThan(
              order[i]?.startedAtMs ?? 0,
            );
        }
  });

  it('moves nothing already drawn when another timer starts: a new one joins the end', () => {
    const running = [timer('sleep', 100), timer('breastfeed', 300), timer('pump', 200)];
    const before = stackOrder(running).map(t => t.id);
    for (const type of KINDS) {
      const after = stackOrder([...running, timer(type, 400)]).map(t => t.id);
      expect(after.slice(0, before.length), type).toEqual(before);
    }
  });

  it('no longer ranks one kind over another (the owner, 2026-09-27)', () => {
    expect(Object.keys(stackModule)).not.toContain('TIMER_PRECEDENCE');
    expect(Object.keys(stackModule)).not.toContain('byPrecedence');
    expect(flat('timerStack.ts')).not.toMatch(/'breastfeed',\s*'pump',\s*'sleep'/);
  });
});

describe('the stack', () => {
  it('draws two whole cards before any row', () => {
    expect(HERO_CARDS).toBe(2);
  });

  it('is nothing when nothing runs', () => {
    expect(timerStack([])).toEqual({ heroes: [], also: [] });
  });

  it('is the card alone for one timer — exactly as ever', () => {
    const only = timer('pump');
    expect(timerStack([only])).toEqual({ heroes: [only], also: [] });
  });

  it('is two whole cards for two timers, the first started on top, and no rows', () => {
    const feed = timer('breastfeed', 200);
    const nap = timer('sleep', 100);
    expect(timerStack([feed, nap])).toEqual({ heroes: [nap, feed], also: [] });
  });

  it('is the first two as cards and a row for every other one, in order, for three or more', () => {
    for (const n of [3, 4])
      for (const kinds of multisets(n)) {
        // started in the opposite of the order they are listed in, so the sort has work to do
        const running = kinds.map((type, i) => timer(type, 10_000 - i));
        const { heroes, also } = timerStack(running);
        const order = stackOrder(running);
        expect(heroes, kinds.join(' ')).toEqual(order.slice(0, 2));
        expect(also, kinds.join(' ')).toEqual(order.slice(2));
        expect(also).toHaveLength(n - 2);
      }
    // and a fifth is one more row, never a third card
    const five = KINDS.concat('sleep').map((type, i) => timer(type, i));
    expect(timerStack(five).heroes).toHaveLength(2);
    expect(timerStack(five).also).toHaveLength(3);
  });
});

describe('the "Also running" card', () => {
  it('is 44 pt a row — the tap target and no taller — under a label', () => {
    expect(ALSO_RUNNING.row).toBe(hit.min);
    expect(alsoRunningHeight(0)).toBe(0);
    expect(alsoRunningHeight(1)).toBe(6 + 13 + 44);
    expect(alsoRunningHeight(2)).toBe(6 + 13 + 2 * 44);
    expect(alsoRunningHeight(3)).toBe(6 + 13 + 3 * 44);
  });

  it('says what it holds in the owner’s words', () => {
    expect(ALSO_RUNNING_TITLE).toBe('Also running');
  });

  it('names a row by the household’s word, and the baby only where there is more than one', () => {
    expect(alsoRunningTitle('Sleep')).toBe('Sleep');
    expect(alsoRunningTitle('Sleep', 'Liam')).toBe('Sleep · Liam');
    expect(alsoRunningTitle('Playtime', '  Emma ')).toBe('Playtime · Emma');
    // an empty name is no name
    expect(alsoRunningTitle('Pump', '')).toBe('Pump');
  });

  it('speaks a row in words, on the minute, never glyphs', () => {
    expect(
      alsoRunningSpoken({
        word: 'Sleep',
        childName: 'Liam',
        elapsedMs: 62 * 60_000,
        paused: false,
      }),
    ).toBe('Sleep timer for Liam, 1 hour 2 minutes');
    expect(
      alsoRunningSpoken({ word: 'Pump', elapsedMs: 12 * 60_000 + 30_000, paused: false }),
    ).toBe('Pump timer, 12 minutes');
    expect(alsoRunningSpoken({ word: 'Breastfeed', elapsedMs: 20_000, paused: true })).toBe(
      'Breastfeed timer, less than a minute, paused',
    );
    // the same name for every second of a minute: a screen reader is not re-read each tick
    const at = (s: number) =>
      alsoRunningSpoken({ word: 'Sleep', elapsedMs: 5 * 60_000 + s * 1000, paused: false });
    expect(new Set(Array.from({ length: 60 }, (_, s) => at(s))).size).toBe(1);
  });
});

describe('a row (tripwires over the source)', () => {
  const src = flat('AlsoRunning.tsx');

  it('is one button that opens the timer, named and hinted, 44 pt tall', () => {
    expect(src).toContain('accessibilityRole="button"');
    expect(src).toContain('const spoken = alsoRunningSpoken({');
    expect(src).toContain('accessibilityLabel={spoken}');
    expect(src).toContain('accessibilityHint="Opens the timer"');
    expect(src).toContain('onPress={item.onOpen}');
    expect(src).toContain('minHeight: ALSO_RUNNING.row,');
  });

  it('is a row to read, with no chevron, when there is nothing to open (a view only member)', () => {
    expect(src).toContain('onOpen?: () => void;');
    expect(src).toContain('if (!item.onOpen)');
    expect(src).toContain('{item.onOpen ? <Icon name="chev"');
  });

  it('carries no stop: a mis-tap on a row must never end a nap', () => {
    expect(src).not.toContain('<StopButton');
    expect(src).not.toMatch(/onStop|onFinish|onLongPress/);
  });

  it('draws the Log’s own chip, and the household’s word', () => {
    expect(src).toContain('<ModuleDisc moduleId={item.type as ModuleId} />');
    expect(src).toContain('alsoRunningTitle(item.word, item.childName)');
    expect(flat('TimelineItem.tsx')).toContain('<ModuleDisc moduleId={moduleId}');
  });

  it('ticks with the card’s own clock, so it stops with the page and freezes with a stopped pump', () => {
    expect(src).toContain('const now = useTimerNow(item.now);');
    expect(src).toContain("formatElapsed(elapsedMs, 'live')");
  });

  it('draws nothing at all for no rows, and a header over the rows', () => {
    expect(src).toContain('if (items.length === 0) return null;');
    expect(src).toContain('accessibilityRole="header"');
  });

  it('writes no color of its own', () => {
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
  });
});
