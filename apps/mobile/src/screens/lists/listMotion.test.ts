/**
 * THE LISTS' TICKS AND THE PAPER PLANE (the owner, 2026-09-25, of the "that's cool" list: *"might
 * not necessarily be useful, but it's cool … Let's try doing everything. I will then review"*).
 *
 * The rules are pure (`listMotion.ts`) and tested as rules: which tick is the last open one, what a
 * tap is felt as, when the sparkle plays, how long a ticked row keeps its place, where every line
 * and chore is drawn meanwhile, and what a tap on Share does, played on a clock turned by hand — the
 * plane thrown, the crease and the throw felt, and the sheet asked for once the plane has gone, once
 * per tap (2026-09-26).
 * The wiring is held by tripwires over the three files that
 * carry it, because this app's tests run in node with no renderer (`shoppingOrder.test.ts` and
 * packages/ui's `interaction.test.ts` say why that is the honest instrument) — and every id a
 * flow or the tour reaches is asserted to be where it was.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CELEBRATION_PRAISE_BANNED,
  dueToday,
  inTheBasket,
  stillToBuy,
  tasksForToday,
  type ShoppingLine,
  type TaskRow,
} from '@nibblecue/core';
import {
  BURST_DELAY_MS,
  BURST_MS,
  CART_LAND_MS,
  cartLanding,
  DONE_MS,
  DONE_ROLL_MS,
  dotReach,
  DOTS_DELAY_MS,
  DOTS_MS,
  ENTER_STAGGER_MS,
  ENTER_WHOLE_MS,
  enterWholeMs,
  PLANE_CREASE_MS,
  PLANE_LAUNCH_MS,
  PLANE_MS,
  planeLaunch,
  RAY_GAP,
  rayReach,
  ROW_AWAY_MS,
  ROW_ENTER_MS,
  ROW_GLIDE_MS,
  SHARE_SAFETY_MS,
  STRIKE_DELAY_MS,
  STRIKE_MS,
  SWIPE_FLING,
  SWIPE_OPEN,
  SWIPE_REMOVE_SHARE,
  swipeRelease,
  TICK_DRAW_MS,
  TICK_UNDRAW_MS,
  UNSTRIKE_MS,
  type CartLanding,
  type PlaneLaunch,
} from '@nibblecue/ui/layout';
import { space, themeNames } from '@nibblecue/ui/theme';
import { createArrivals } from '../../lists/arrivals';
import { SHOPPING, SUPPLIES } from '../../lists/copy';
import { createIntro } from '../../lists/intro';
import {
  ARRIVAL_FRESH_MS,
  ARRIVAL_SPREAD_MS,
  ARRIVAL_STAGGER_MS,
  arrivalDelays,
  AWAY_MS,
  CART_IDLE,
  cartLanded,
  cartShows,
  cartThrown,
  clearFeel,
  DONE_AFTER_MS,
  finishesList,
  GLIDE_MS,
  introDelays,
  lineFeel,
  lineMotion,
  LIST_AT_REST,
  OWED_MS,
  owedDraw,
  owedLapse,
  owedStart,
  owedTap,
  placeLines,
  placeTasks,
  restPlace,
  runAddToList,
  SETTLE_LAST_MS,
  SETTLE_MS,
  shareButton,
  shoppingTicks,
  TICK_FILL,
  tickFeel,
  tickFillFrames,
  UNSETTLE_MS,
  type CartCount,
  type LinePlace,
  type ListMotionNow,
  type Tickable,
} from './listMotion';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out, whitespace flattened: a scan reads the code, never the explanation of it. */
const code = (f: string): string =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const line = (id: string, checked: boolean, over: Partial<ShoppingLine> = {}): ShoppingLine => ({
  id,
  title: id,
  qty: 1,
  note: null,
  store: null,
  checkedAt: checked ? '2026-09-25T10:00:00.000Z' : null,
  ...over,
});

const task = (id: string, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  title: id,
  atLocalTime: null,
  repeat: 'DAILY',
  assignedTo: null,
  lastDoneOn: null,
  ...over,
});

const list = (...open: boolean[]): Tickable[] => open.map((o, i) => ({ id: `l${i}`, open: o }));

describe('which tick is the last open one', () => {
  it('is the one open line when every other line is done', () => {
    expect(finishesList(list(false, true, false), 'l1')).toBe(true);
  });

  it('is no line while two or more are still open', () => {
    expect(finishesList(list(true, true, false), 'l0')).toBe(false);
    expect(finishesList(list(true, true, false), 'l1')).toBe(false);
  });

  it('finishes a list of one with its one tick', () => {
    expect(finishesList(list(true), 'l0')).toBe(true);
  });

  it('is never a line already ticked, one not on the list, or anything on an empty list', () => {
    // unticking the last line un-finishes the list; it does not finish it again
    expect(finishesList(list(false, false), 'l0')).toBe(false);
    expect(finishesList(list(false, true), 'nope')).toBe(false);
    expect(finishesList([], 'l0')).toBe(false);
  });

  it('reads the shopping list as ticks: a line is open until it is in the basket', () => {
    expect(shoppingTicks([line('a', false), line('b', true)])).toEqual([
      { id: 'a', open: true },
      { id: 'b', open: false },
    ]);
  });
});

describe('what a tap is, besides the write', () => {
  it('is felt as a tap, drawn, and held while it lands', () => {
    expect(tickFeel(list(true, true), 'l0', true, false)).toEqual({
      haptic: 'tap',
      burst: false,
      settleMs: SETTLE_MS,
    });
  });

  it('is felt as a finish, sparkles, and holds a little longer when it empties the list', () => {
    expect(tickFeel(list(false, true), 'l1', true, false)).toEqual({
      haptic: 'success',
      burst: true,
      settleMs: SETTLE_LAST_MS,
    });
  });

  it('just clears when it is an untick: nothing felt, nothing drawn, nothing held', () => {
    for (const still of [false, true])
      expect(tickFeel(list(false, false), 'l0', false, still)).toEqual({
        haptic: null,
        burst: false,
        settleMs: 0,
      });
  });

  it('moves nothing under reduce motion or in the amber night — and is still felt', () => {
    expect(tickFeel(list(true, true), 'l0', true, true)).toEqual({
      haptic: 'tap',
      burst: false,
      settleMs: 0,
    });
    expect(tickFeel(list(false, true), 'l1', true, true)).toEqual({
      haptic: 'success',
      burst: false,
      settleMs: 0,
    });
  });

  it('holds a row until its stroke — and the last one’s sparkle — has landed, and not much after', () => {
    // a beat past the flourish, so the tick is seen whole before the list settles
    expect(SETTLE_MS).toBeGreaterThanOrEqual(TICK_DRAW_MS + 200);
    expect(SETTLE_LAST_MS).toBeGreaterThanOrEqual(BURST_DELAY_MS + BURST_MS + 200);
    // and nobody is left waiting on a row to get out of the way
    expect(SETTLE_MS).toBeLessThanOrEqual(600);
    expect(SETTLE_LAST_MS).toBeLessThanOrEqual(1000);
  });
});

describe('where the shopping lines are drawn', () => {
  const lines = [line('a', false), line('b', true), line('c', false), line('d', true)];
  const held = (...pairs: [string, LinePlace][]) => new Map<string, LinePlace>(pairs);
  const ids = (xs: readonly ShoppingLine[]) => xs.map(l => l.id);

  it('is the list as it is, with nothing moving', () => {
    expect(placeLines(lines, held())).toEqual({
      toBuy: stillToBuy(lines),
      basket: inTheBasket(lines),
    });
    expect(restPlace(line('x', false))).toBe('toBuy');
    expect(restPlace(line('x', true))).toBe('basket');
  });

  it('keeps a line ticked a moment ago in the to-buy card, in its own place', () => {
    const shown = placeLines(lines, held(['b', 'toBuy']));
    expect(ids(shown.toBuy)).toEqual(['a', 'b', 'c']);
    expect(ids(shown.basket)).toEqual(['d']);
    // drawn as it is — ticked — not as it was
    expect(shown.toBuy[1]?.checkedAt).not.toBeNull();
  });

  it('keeps a line unticked a moment ago in the basket while its tick runs back', () => {
    const unticked = lines.map(l => (l.id === 'd' ? { ...l, checkedAt: null } : l));
    const shown = placeLines(unticked, held(['d', 'basket']));
    expect(ids(shown.toBuy)).toEqual(['a', 'c']);
    expect(ids(shown.basket)).toEqual(['b', 'd']);
    // …and a tap never moves a line before its write lands: held where it was tapped either way
    expect(ids(placeLines(lines, held(['d', 'basket'])).basket)).toEqual(['b', 'd']);
    expect(ids(placeLines(lines, held(['a', 'toBuy'])).toBuy)).toEqual(['a', 'c']);
  });

  it('draws a line let go by the settle in both cards while it glides, and then in one', () => {
    // b was ticked and held to buy; the list settled: b leaves the list as it arrives in the basket
    const shown = placeLines(lines, held(), held(['b', 'toBuy']));
    expect(ids(shown.toBuy)).toEqual(['a', 'b', 'c']);
    expect(ids(shown.basket)).toEqual(['b', 'd']);
    // a line held where it belongs anyway — ticked and unticked before the list settled — glides nowhere
    const back = placeLines(lines, held(), held(['a', 'toBuy']));
    expect(back).toEqual({ toBuy: stillToBuy(lines), basket: inTheBasket(lines) });
  });

  it('draws the basket Clear took until it is swept off, first, and each line once', () => {
    const swept = [line('d', true), line('e', true)];
    // e's removal has landed; d's has not yet — d is drawn once, as the swept line
    const shown = placeLines(lines, held(), held(), swept);
    expect(ids(shown.basket)).toEqual(['d', 'e', 'b']);
    expect(ids(shown.toBuy)).toEqual(['a', 'c']);
  });

  it('draws every line exactly once at rest, whatever is held', () => {
    for (const h of [
      held(),
      held(['b', 'toBuy']),
      held(['a', 'toBuy'], ['b', 'toBuy'], ['d', 'basket'], ['zzz', 'toBuy']),
    ]) {
      const shown = placeLines(lines, h);
      expect([...shown.toBuy, ...shown.basket].map(l => l.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('what a line is doing where it is drawn (lineMotion)', () => {
  const now = (over: Partial<ListMotionNow>): ListMotionNow => ({ ...LIST_AT_REST, ...over });
  const ticked = line('b', true);
  const open = line('b', false);

  it('glides a ticked line down: out of the list and into the basket', () => {
    const m = now({ gliding: new Map([['b', 'toBuy']]) });
    expect(lineMotion(ticked, 'toBuy', m)).toBe('sink');
    expect(lineMotion(ticked, 'basket', m)).toBe('drop');
  });

  it('glides an unticked line up: out of the basket and into the list', () => {
    const m = now({ gliding: new Map([['b', 'basket']]) });
    expect(lineMotion(open, 'basket', m)).toBe('lift');
    expect(lineMotion(open, 'toBuy', m)).toBe('rise');
  });

  it('pops a line put on the list here, in the list and nowhere else', () => {
    const m = now({ popping: new Set(['b']) });
    expect(lineMotion(open, 'toBuy', m)).toBe('pop');
    expect(lineMotion(ticked, 'basket', m)).toBeNull();
  });

  it('sweeps a cleared line off the basket', () => {
    expect(lineMotion(ticked, 'basket', now({ swept: new Set(['b']) }))).toBe('sweep');
  });

  it('rests a held line where it is held, while its old copy still leaves', () => {
    // tapped again as it glides: held in the basket now, the list's copy still sinking away
    const m = now({ held: new Map([['b', 'basket']]), gliding: new Map([['b', 'toBuy']]) });
    expect(lineMotion(ticked, 'basket', m)).toBeNull();
    expect(lineMotion(ticked, 'toBuy', m)).toBe('sink');
    expect(lineMotion(ticked, 'basket', now({ held: new Map([['b', 'toBuy']]) }))).toBeNull();
  });

  it('is at rest with nothing moving', () => {
    for (const l of [ticked, open])
      for (const place of ['toBuy', 'basket'] as const)
        expect(lineMotion(l, place, LIST_AT_REST)).toBeNull();
  });

  it('sends a line taken off here off the edge, wherever it is drawn (S5)', () => {
    const m = now({ away: new Set(['b']), popping: new Set(['b']), intro: new Set(['b']) });
    expect(lineMotion(open, 'toBuy', m)).toBe('away');
  });

  it('raises every line the first time the list opens — but a line just added pops (S1)', () => {
    expect(lineMotion(open, 'toBuy', now({ intro: new Set(['b']) }))).toBe('enter');
    expect(lineMotion(ticked, 'basket', now({ intro: new Set(['b']) }))).toBe('enter');
    expect(lineMotion(open, 'toBuy', now({ intro: new Set(['b']), popping: new Set(['b']) }))).toBe(
      'pop',
    );
    // a line on the move is on the move, whatever else
    const gliding = now({ intro: new Set(['b']), gliding: new Map([['b', 'toBuy']]) });
    expect(lineMotion(ticked, 'basket', gliding)).toBe('drop');
    expect(
      lineMotion(ticked, 'toBuy', now({ intro: new Set(['b']), held: new Map([['b', 'toBuy']]) })),
    ).toBeNull();
  });
});

describe('the first open (S1)', () => {
  it('raises the lines one after another, the whole list landed within 400 ms', () => {
    const d = introDelays(['a', 'b', 'c']);
    expect([...d.entries()]).toEqual([
      ['a', 0],
      ['b', ENTER_STAGGER_MS],
      ['c', 2 * ENTER_STAGGER_MS],
    ]);
    for (const n of [1, 2, 6, 7, 20, 60]) {
      const ids = Array.from({ length: n }, (_, i) => `l${i}`);
      const last = Math.max(...introDelays(ids).values());
      expect(last + ROW_ENTER_MS, `${n}`).toBeLessThanOrEqual(ENTER_WHOLE_MS + 1);
      expect(enterWholeMs(n), `${n}`).toBeLessThanOrEqual(ENTER_WHOLE_MS + 1e-9);
    }
    expect(introDelays([]).size).toBe(0);
  });

  it('plays once per run of the app: due until taken, and never again after', () => {
    const intro = createIntro();
    expect(intro.due()).toBe(true);
    intro.take();
    expect(intro.due()).toBe(false);
    intro.take();
    expect(intro.due()).toBe(false);
    // a fresh run of the app is a fresh latch
    expect(createIntro().due()).toBe(true);
  });
});

describe('what a tap here owes the words (S3, S4)', () => {
  it('rolls "N to buy" when a tick here lands, and simply sets any other change', () => {
    let o = owedStart(0);
    // the list read in: set
    o = owedDraw(o, 3);
    expect(o.roll).toBe(0);
    // a tick here, then its write lands: rolls
    o = owedDraw(owedTap(o, false), 2);
    expect(o).toMatchObject({ seen: 2, roll: 1, rolls: 0 });
    // an untick here: rolls up
    o = owedDraw(owedTap(o, false), 3);
    expect(o).toMatchObject({ seen: 3, roll: 2 });
    // a line added, or a tick from the other phone: set, no roll
    o = owedDraw(o, 4);
    expect(o).toMatchObject({ seen: 4, roll: 2 });
    // drawn again with the same count: the same object, so a render settles
    expect(owedDraw(o, 4)).toBe(o);
  });

  it('rolls each of three quick ticks as each lands', () => {
    let o = owedDraw(owedStart(0), 5);
    for (let i = 0; i < 3; i += 1) o = owedTap(o, false);
    o = owedDraw(o, 4);
    o = owedDraw(o, 3);
    o = owedDraw(o, 2);
    expect(o).toMatchObject({ seen: 2, roll: 3, rolls: 0 });
  });

  it('lets a note go that no write paid, so it cannot roll a change it had nothing to do with', () => {
    let o = owedTap(owedDraw(owedStart(0), 3), true);
    o = owedLapse(o);
    expect(o).toMatchObject({ rolls: 0, finish: false });
    o = owedDraw(o, 0);
    expect(o).toMatchObject({ roll: 0, done: 0 });
    // and a lapse with nothing owed changes nothing
    expect(owedLapse(o)).toBe(o);
    expect(OWED_MS).toBeGreaterThanOrEqual(1000);
  });

  it('starts the cart for the tick here that empties the list, once it lands — and never otherwise', () => {
    // opened empty: nothing
    expect(owedDraw(owedStart(0), 0).done).toBe(0);
    // emptied by the other phone, or by a Clear, or a line taken off: nothing
    let o = owedDraw(owedStart(0), 1);
    expect(owedDraw(o, 0).done).toBe(0);
    // the last tick here: once its write lands
    o = owedTap(o, true);
    expect(o.done).toBe(0);
    o = owedDraw(o, 0);
    expect(o).toMatchObject({ done: 1, finish: false, roll: 1 });
    // an untick and the last tick again: once more
    o = owedDraw(owedTap(o, false), 1);
    o = owedDraw(owedTap(o, true), 0);
    expect(o.done).toBe(2);
  });

  it('sets the cart off once the finished line has settled into the basket, and is gone soon after', () => {
    expect(DONE_AFTER_MS).toBe(SETTLE_LAST_MS + ROW_GLIDE_MS);
    // the whole moment, from the write landing to nothing on the screen, is a few seconds
    expect(DONE_AFTER_MS + DONE_MS).toBeLessThanOrEqual(3600);
    expect(DONE_ROLL_MS).toBeLessThan(DONE_MS);
  });

  it('says a plain fact: no praise, no exclamation', () => {
    expect(SHOPPING.allDone).toBe('All done');
    for (const banned of CELEBRATION_PRAISE_BANNED)
      expect(SHOPPING.allDone.toLowerCase(), banned).not.toContain(banned);
    expect(SHOPPING.allDone).not.toMatch(/[!?]/);
  });
});

describe('swipe to remove (S5)', () => {
  const W = 340;
  // the app's one swipe's number (packages/ui `swipeRow.ts`), which the row slides by since 2026-09-29
  it('reads how far out Remove shows', () => expect(SWIPE_OPEN).toBe(88));

  it('takes a line off past half its width, or on a flick left once Remove is showing', () => {
    expect(swipeRelease(-W / 2, 0, W, SWIPE_OPEN)).toBe('remove');
    expect(swipeRelease(-W * 0.8, -0.1, W, SWIPE_OPEN)).toBe('remove');
    expect(swipeRelease(-SWIPE_OPEN - 10, -SWIPE_FLING, W, SWIPE_OPEN)).toBe('remove');
    // a flick that has not even shown Remove takes nothing off
    expect(swipeRelease(-40, -2, W, SWIPE_OPEN)).toBe('rest');
  });

  it('stops with Remove showing past half of it, and goes back to rest short of that', () => {
    expect(swipeRelease(-SWIPE_OPEN, 0, W, SWIPE_OPEN)).toBe('open');
    expect(swipeRelease(-SWIPE_OPEN / 2 - 1, 0, W, SWIPE_OPEN)).toBe('open');
    expect(swipeRelease(-SWIPE_OPEN / 2 + 1, 0, W, SWIPE_OPEN)).toBe('rest');
    expect(swipeRelease(0, 0, W, SWIPE_OPEN)).toBe('rest');
  });

  it('shuts on a flick back to the right, however far out it was', () => {
    expect(swipeRelease(-W * 0.9, SWIPE_FLING, W, SWIPE_OPEN)).toBe('rest');
    expect(swipeRelease(-SWIPE_OPEN, 1.5, W, SWIPE_OPEN)).toBe('rest');
  });

  it('takes a row it has not measured off only on a flick', () => {
    expect(swipeRelease(-500, 0, 0, SWIPE_OPEN)).toBe('open');
    expect(swipeRelease(-500, -1, 0, SWIPE_OPEN)).toBe('remove');
    // and the half-way mark is always further than Remove, so a line is never off by opening it
    expect(W * SWIPE_REMOVE_SHARE).toBeGreaterThan(SWIPE_OPEN);
  });

  it('draws a line taken off back where it stood while it goes, once, and counts it as gone', () => {
    const lines = [line('a', false), line('b', false), line('c', false), line('d', true)];
    const gone = lines.filter(l => l.id !== 'b');
    const shown = placeLines(gone, new Map(), new Map(), [], [{ line: line('b', false), at: 1 }]);
    expect(shown.toBuy.map(l => l.id)).toEqual(['a', 'b', 'c']);
    expect(shown.basket.map(l => l.id)).toEqual(['d']);
    // its write not landed yet: drawn once, as the one going
    const early = placeLines(lines, new Map(), new Map(), [], [{ line: line('b', false), at: 1 }]);
    expect(early.toBuy.map(l => l.id)).toEqual(['a', 'b', 'c']);
    // the list has shrunk under it meanwhile: it goes at the end, never past it
    const end = placeLines(
      [line('a', false)],
      new Map(),
      new Map(),
      [],
      [{ line: line('z', false), at: 7 }],
    );
    expect(end.toBuy.map(l => l.id)).toEqual(['a', 'z']);
    expect(AWAY_MS).toBe(ROW_AWAY_MS);
  });
});

describe('the shopping list’s own tick (lineFeel)', () => {
  it('throws dots on every tick but the one that finishes the list, which keeps its rays', () => {
    expect(lineFeel(list(true, true), 'l0', true, false)).toEqual({
      haptic: 'tap',
      burst: false,
      dots: true,
      drop: true,
      finish: false,
      settleMs: SETTLE_MS,
    });
    expect(lineFeel(list(false, true), 'l1', true, false)).toEqual({
      haptic: 'success',
      burst: true,
      dots: false,
      drop: true,
      finish: true,
      settleMs: SETTLE_LAST_MS,
    });
  });

  it('runs an untick back in the basket before it glides up — felt as nothing, and no dots', () => {
    expect(lineFeel(list(false, false), 'l0', false, false)).toEqual({
      haptic: null,
      burst: false,
      dots: false,
      drop: false,
      finish: false,
      settleMs: UNSETTLE_MS,
    });
  });

  it('moves and throws nothing under reduce motion or in the amber Night — and is still felt', () => {
    expect(lineFeel(list(true, true), 'l0', true, true)).toEqual({
      haptic: 'tap',
      burst: false,
      dots: false,
      drop: false,
      finish: false,
      settleMs: 0,
    });
    // the last tick is still felt as a finish, and nothing drops, rolls or comes up
    expect(lineFeel(list(false, true), 'l1', true, true)).toMatchObject({
      haptic: 'success',
      drop: false,
      finish: false,
    });
    expect(lineFeel(list(false, false), 'l0', false, true).settleMs).toBe(0);
  });

  it('keeps the checklist’s rules: same haptic, same rays, same hold for a tick', () => {
    for (const [l, id] of [
      [list(true, true), 'l0'],
      [list(false, true), 'l1'],
    ] as const)
      for (const still of [false, true]) {
        const feel = lineFeel(l, id, true, still);
        expect({ haptic: feel.haptic, burst: feel.burst, settleMs: feel.settleMs }).toEqual(
          tickFeel(l, id, true, still),
        );
      }
  });

  it('holds a tick until the dots and the line through the words have landed, and not much after', () => {
    expect(SETTLE_MS).toBeGreaterThanOrEqual(DOTS_DELAY_MS + DOTS_MS);
    expect(SETTLE_MS).toBeGreaterThanOrEqual(STRIKE_DELAY_MS + STRIKE_MS);
  });

  it('holds an untick while the stroke lifts, the circle clears and the line is taken back', () => {
    expect(UNSETTLE_MS).toBeGreaterThanOrEqual(TICK_UNDRAW_MS);
    expect(UNSETTLE_MS).toBeGreaterThanOrEqual(TICK_FILL.outDelay + TICK_FILL.outMs);
    expect(UNSETTLE_MS).toBeGreaterThanOrEqual(UNSTRIKE_MS);
    expect(UNSETTLE_MS).toBeLessThanOrEqual(600);
    // and each glide after a settle is short
    expect(GLIDE_MS).toBe(ROW_GLIDE_MS);
    expect(GLIDE_MS).toBeLessThanOrEqual(450);
  });
});

describe('the tick’s circle fills and clears', () => {
  const f = tickFillFrames();
  const at = (fr: { inputRange: number[]; outputRange: number[] }, p: number) => {
    const i = Math.max(0, fr.inputRange.findIndex(x => x >= p) - 1);
    const [x0, x1] = [fr.inputRange[i] ?? 0, fr.inputRange[i + 1] ?? 1];
    const [y0, y1] = [fr.outputRange[i] ?? 0, fr.outputRange[i + 1] ?? 0];
    return p <= x0 ? y0 : y0 + ((Math.min(p, x1) - x0) / (x1 - x0)) * (y1 - y0);
  };

  it('grows out of the middle past full and settles, and runs the same way back', () => {
    expect(at(f.scale, 0)).toBe(TICK_FILL.from);
    expect(at(f.scale, 1)).toBe(1);
    expect(Math.max(...f.scale.outputRange)).toBe(TICK_FILL.peak);
    expect(TICK_FILL.peak).toBeLessThanOrEqual(1.08);
    expect(at(f.opacity, 0)).toBe(0);
    expect(at(f.opacity, 1)).toBe(1);
    // quick: under a fifth of a second either way
    expect(TICK_FILL.inMs).toBeLessThanOrEqual(200);
    expect(TICK_FILL.outDelay + TICK_FILL.outMs).toBeLessThanOrEqual(300);
  });

  it('waits for the stroke to start lifting before it clears, so the stroke is never white on nothing', () => {
    // the stroke has run back by the time the fill has gone
    expect(TICK_FILL.outDelay + TICK_FILL.outMs).toBeGreaterThan(TICK_UNDRAW_MS);
    expect(TICK_FILL.outDelay).toBeGreaterThan(0);
  });
});

describe('a line put on the list here pops in', () => {
  it('pops lines arriving together one after another, and the last within a quarter second', () => {
    expect(arrivalDelays([])).toEqual(new Map());
    expect(arrivalDelays(['a'])).toEqual(new Map([['a', 0]]));
    expect([...arrivalDelays(['a', 'b', 'c']).values()]).toEqual([
      0,
      ARRIVAL_STAGGER_MS,
      2 * ARRIVAL_STAGGER_MS,
    ]);
    for (let n = 2; n <= 20; n += 1) {
      const d = [...arrivalDelays(Array.from({ length: n }, (_, i) => `l${i}`)).values()];
      expect(Math.max(...d), `${n}`).toBeLessThanOrEqual(ARRIVAL_SPREAD_MS);
      for (let i = 1; i < d.length; i += 1) expect(d[i] ?? 0).toBeGreaterThan(d[i - 1] ?? 0);
    }
  });

  it('remembers what was put on the list here for a minute, and forgets a line once it has popped', () => {
    const a = createArrivals();
    a.note('x', 1000);
    a.note('y', 2000);
    expect(a.fresh(2500)).toEqual(['x', 'y']);
    a.forget(['x']);
    expect(a.fresh(2500)).toEqual(['y']);
    // a minute on, what never showed is forgotten on its own
    expect(a.fresh(2000 + ARRIVAL_FRESH_MS + 1)).toEqual([]);
    expect(a.fresh(0)).toEqual([]);
  });
});

describe('Clear sweeps the trip away, felt once', () => {
  const basket = [line('d', true), line('e', true)];

  it('is felt as a finish, once, and sweeps the basket as the tap found it', () => {
    const feel = clearFeel(basket, false);
    expect(feel.haptic).toBe('success');
    expect(feel.swept.map(l => l.id)).toEqual(['d', 'e']);
  });

  it('is still felt under reduce motion and in the amber Night, and the lines simply go', () => {
    expect(clearFeel(basket, true)).toEqual({ haptic: 'success', swept: [] });
  });
});

/**
 * A + ON THE SUPPLIES PAGE, PLAYED ON A CLOCK TURNED BY HAND: every move the tap makes, stamped with
 * the time it is made, the timers run in the order they fall due.
 */
function playAdd(landing: CartLanding): [number, string][] {
  const moves: [number, string][] = [];
  const due: [number, () => void][] = [];
  let now = 0;
  runAddToList(landing, {
    feel: kind => moves.push([now, `feel ${kind}`]),
    fly: () => moves.push([now, 'fly']),
    land: () => moves.push([now, 'land']),
    later: (fn, ms) => due.push([now + ms, fn]),
  });
  for (const [at, fn] of [...due].sort((a, b) => a[0] - b[0])) {
    now = at;
    fn();
  }
  return moves;
}

describe('the Supplies page’s cart (runAddToList, cartShows)', () => {
  it('throws on the tap, and at the landing is felt once, bounces and counts', () => {
    expect(playAdd(cartLanding(false, 'light'))).toEqual([
      [0, 'fly'],
      [CART_LAND_MS, 'feel tap'],
      [CART_LAND_MS, 'land'],
    ]);
  });

  it('throws nothing under reduce motion or in the amber Night, and is felt on the tap', () => {
    for (const theme of themeNames)
      for (const reduceMotion of [false, true]) {
        const moves = playAdd(cartLanding(reduceMotion, theme));
        if (reduceMotion || theme === 'night') expect(moves).toEqual([[0, 'feel tap']]);
        // one haptic per add, whichever way
        expect(moves.filter(([, m]) => m.startsWith('feel'))).toHaveLength(1);
      }
  });

  it('holds the count where it was until each thing lands, then goes up by one per landing', () => {
    let c: CartCount = CART_IDLE;
    // 3 on the list; two thrown in quick succession, the writes landing at once
    c = cartThrown(c, 3);
    c = cartThrown(c, 4);
    expect(cartShows(c, 5)).toBe(3);
    c = cartLanded(c);
    expect(cartShows(c, 5)).toBe(4);
    c = cartLanded(c);
    expect(c).toEqual(CART_IDLE);
    expect(cartShows(c, 5)).toBe(5);
  });

  it('never shows more than the list has: a write that did not land is not counted', () => {
    const c = cartLanded(cartThrown(cartThrown(CART_IDLE, 3), 3));
    expect(cartShows(c, 3)).toBe(3);
    expect(cartShows(cartThrown(CART_IDLE, 3), 2)).toBe(2);
    expect(cartShows(CART_IDLE, 7)).toBe(7);
  });

  it('says where the thing went, for a parent who cannot see the throw', () => {
    expect(SUPPLIES.addedToList('Diapers')).toBe('Added Diapers to the shopping list');
  });
});

describe('where the chores are drawn', () => {
  const today = '2026-09-25';
  // a Friday
  const weekday = 5;
  const tasks = [
    task('wash', { atLocalTime: '21:00' }),
    task('once', { repeat: 'ONCE', title: 'Buy a car seat' }),
    task('weekend', { repeat: 'WEEKENDS' }),
    task('bag', { atLocalTime: '08:00', lastDoneOn: today }),
  ];

  it('is today’s list and the rest, with nothing settling', () => {
    const placed = placeTasks(tasks, weekday, new Set());
    expect(placed.today).toEqual(tasksForToday(tasks, weekday));
    expect(placed.later).toEqual(tasks.filter(x => !dueToday(x, weekday)));
  });

  it('keeps a "just once" chore ticked a moment ago on Today, in its slot, drawn done', () => {
    const done = tasks.map(x => (x.id === 'once' ? { ...x, lastDoneOn: today } : x));
    // without the hold it would leave Today the moment it was ticked
    expect(placeTasks(done, weekday, new Set()).today.map(x => x.id)).not.toContain('once');
    const held = placeTasks(done, weekday, new Set(['once']));
    expect(held.today.map(x => x.id)).toEqual(['bag', 'wash', 'once']);
    expect(held.today.find(x => x.id === 'once')?.lastDoneOn).toBe(today);
    expect(held.later.map(x => x.id)).toEqual(['weekend']);
  });

  it('changes nothing for a chore that stays on Today anyway', () => {
    const done = tasks.map(x => (x.id === 'wash' ? { ...x, lastDoneOn: today } : x));
    expect(placeTasks(done, weekday, new Set(['wash']))).toEqual(
      placeTasks(done, weekday, new Set()),
    );
  });
});

/**
 * THE SHARE BUTTON, PLAYED ON A CLOCK TURNED BY HAND: every move it makes stamped with the time it is
 * made, its timers run in the order they fall due, and the plane's landing — `PaperPlane`'s
 * `onLanded` — handed in at whatever moment the test says the drawing finished.
 */
function shareClock() {
  const moves: [number, string][] = [];
  let due: { at: number; fn: () => void }[] = [];
  let now = 0;
  const button = shareButton({
    feel: kind => moves.push([now, `feel ${kind}`]),
    throwPlane: n => moves.push([now, `throw ${n}`]),
    later: (fn, ms) => due.push({ at: now + ms, fn }),
  });
  /** Turn the clock on to `to`, running every timer that falls due on the way. */
  const until = (to: number) => {
    for (;;) {
      const next = due.filter(d => d.at <= to).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      due = due.filter(d => d !== next);
      now = next.at;
      next.fn();
    }
    now = to;
  };
  return {
    moves,
    button,
    until,
    tap: (launch: PlaneLaunch) => button.tap(launch, () => moves.push([now, 'send'])),
    sends: () => moves.filter(([, m]) => m === 'send'),
  };
}

/** A flight as a phone draws it: set off a frame or two after the tap, landed a little past its length. */
const LANDS_AT = PLANE_MS + 40;

describe('what a tap on Share does, across taps (shareButton)', () => {
  it('throws the plane on the tap, feels the crease and the throw, and asks for the sheet only once it has landed', () => {
    const c = shareClock();
    expect(c.tap(planeLaunch(false, 'light'))).toBe(true);
    // the whole flight, and a hair past it: thrown and felt, and no sheet over it
    c.until(LANDS_AT - 1);
    expect(c.moves).toEqual([
      [0, 'throw 1'],
      [PLANE_CREASE_MS, 'feel tap'],
      [PLANE_LAUNCH_MS, 'feel success'],
    ]);
    expect(c.button.waiting()).toBe(true);
    // the plane has gone: the sheet, at that moment
    c.until(LANDS_AT);
    c.button.landed(1);
    expect(c.sends()).toEqual([[LANDS_AT, 'send']]);
    expect(c.button.waiting()).toBe(false);
    // and the latest time, when it comes, finds nothing left to send
    c.until(SHARE_SAFETY_MS + 1000);
    expect(c.sends()).toHaveLength(1);
  });

  it('asks for the sheet at the latest time when the landing is never heard, and never before it', () => {
    const c = shareClock();
    c.tap(planeLaunch(false, 'dark'));
    c.until(SHARE_SAFETY_MS - 1);
    expect(c.sends()).toEqual([]);
    c.until(SHARE_SAFETY_MS);
    expect(c.sends()).toEqual([[SHARE_SAFETY_MS, 'send']]);
    // a landing heard after that asks for nothing more
    c.button.landed(1);
    expect(c.sends()).toHaveLength(1);
    // the latest time is past the whole flight, so it never cuts a plane short that set off late
    expect(SHARE_SAFETY_MS).toBeGreaterThan(LANDS_AT);
  });

  it('sends at once, felt as a finish, with no plane under reduce motion or in the amber night', () => {
    for (const theme of themeNames)
      for (const reduceMotion of [false, true]) {
        const c = shareClock();
        c.tap(planeLaunch(reduceMotion, theme));
        const label = `${theme}, reduce motion ${reduceMotion}`;
        if (reduceMotion || theme === 'night') {
          expect(c.moves, label).toEqual([
            [0, 'feel success'],
            [0, 'send'],
          ]);
          expect(c.button.waiting(), label).toBe(false);
          c.until(SHARE_SAFETY_MS + 1000);
          expect(c.moves, label).toHaveLength(2);
        } else {
          expect(c.moves, label).toEqual([[0, 'throw 1']]);
          expect(c.button.waiting(), label).toBe(true);
        }
      }
  });

  it('asks for exactly one sheet per tap: a second tap while the plane is in the air is let go', () => {
    const c = shareClock();
    const launch = planeLaunch(false, 'light');
    c.tap(launch);
    // tapped again mid-flight, twice: nothing thrown, felt or sent for either
    c.until(300);
    expect(c.tap(launch)).toBe(false);
    c.until(500);
    expect(c.tap(launch)).toBe(false);
    c.until(LANDS_AT);
    c.button.landed(1);
    expect(c.moves.filter(([, m]) => m.startsWith('throw'))).toEqual([[0, 'throw 1']]);
    expect(c.moves.filter(([, m]) => m.startsWith('feel'))).toHaveLength(2);
    expect(c.sends()).toEqual([[LANDS_AT, 'send']]);
    // once its sheet is asked for, the next tap is taken — with a plane of its own
    const again = LANDS_AT + 200;
    c.until(again);
    expect(c.tap(launch)).toBe(true);
    expect(c.moves).toContainEqual([again, 'throw 2']);
    // the first tap's latest time falls in the second plane's flight: it sends nothing for it
    expect(SHARE_SAFETY_MS).toBeGreaterThan(again);
    expect(SHARE_SAFETY_MS).toBeLessThan(again + LANDS_AT);
    c.until(again + LANDS_AT - 1);
    expect(c.sends()).toHaveLength(1);
    // nor does the first plane landing twice; only the second plane's own landing does
    c.button.landed(1);
    expect(c.sends()).toHaveLength(1);
    c.until(again + LANDS_AT);
    c.button.landed(2);
    expect(c.sends()).toEqual([
      [LANDS_AT, 'send'],
      [again + LANDS_AT, 'send'],
    ]);
  });
});

describe('the shopping list, wired (tripwires over ShoppingScreen.tsx)', () => {
  const src = code('ShoppingScreen.tsx');

  it('decides the feel on the tap, before the write, and hands the sparkle or the dots to that line', () => {
    const decide = src.indexOf('const feel = lineFeel(shoppingTicks(lines), id, checked, still);');
    const write = src.indexOf('await tickShoppingItem(');
    expect(decide).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(decide);
    const between = src.slice(decide, write);
    expect(between).toContain('if (feel.haptic !== null) haptic(feel.haptic);');
    expect(between).toContain('setBurstId(feel.burst ? id : null);');
    expect(between).toContain('if (feel.dots) { setDotted(s => new Set(s).add(id));');
    // a tap never moves a line: it is held in the card it is drawn in now
    expect(between).toContain(
      "const where: LinePlace = settling.places.get(id) ?? (line === undefined ? 'toBuy' : restPlace(line));",
    );
    expect(between).toContain('if (feel.settleMs > 0) settling.hold(id, feel.settleMs, where);');
    expect(between.indexOf('await context()')).toBeGreaterThan(between.indexOf('settling.hold'));
    expect(src).toContain('burst={burstId === l.id}');
    expect(src).toContain('dots={dotted.has(l.id)}');
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // and a settle lets the held lines glide for the glide's own length
    expect(src).toContain('const settling = useSettling<LinePlace>(GLIDE_MS);');
  });

  it('pops a line put on the list here — once the list is in front of the parent', () => {
    // noted where it is written, after the write, from both of the list's own adds
    expect(src).toContain(
      "if (!r.committed) return; tour?.did('shop:add'); arrivals.note(r.itemId);",
    );
    expect(src).toContain(
      "if (r.committed) tour?.did('shop:add'); if (r.committed) arrivals.note(r.itemId);",
    );
    // not behind a sheet, and not under a page pushed over the tabs
    expect(src).toContain('const covered = !focused || pickerOpen || target !== null;');
    expect(src).toContain("wait={covered && motion === 'pop'}");
    // forgotten once they have popped, so a line redrawn later never pops again
    expect(src).toContain('arrivals.forget(ids);');
    expect(src).toContain('<RowMotion key={l.id} motion={motion}');
  });

  it('sweeps the basket on Clear — felt once, on the tap — around the same writes and the same undo', () => {
    const start = src.indexOf('const clear = async () => {');
    const body = src.slice(start, src.indexOf('const share = () => {', start));
    const feel = body.indexOf('const feel = clearFeel(basket, still); haptic(feel.haptic);');
    expect(feel).toBeGreaterThan(-1);
    expect(body.match(/haptic\(/g) ?? []).toHaveLength(1);
    // before the write, and the write is the trip's own: every bought line leaving and each bought
    // supply's date, in ONE intent (`finishTrip`, 2026-09-26), and the one Undo that puts both back
    expect(feel).toBeLessThan(body.indexOf('await finishTrip('));
    expect(body).toContain(
      'const r = await finishTrip(db, systemClock, { ...w, ...tripDays(timeZone) });',
    );
    expect(body).toContain(
      'void putBackTrip(db, systemClock, { ...w, trip }).then(() => toast.show(SHOPPING.tripUndone), );',
    );
    expect(body).toContain('sweepOff(feel.swept);');
    // the sweep: the basket as the tap found it, a line at a time, for the sweep's whole length
    const sweep = src.slice(src.indexOf('const sweepOff = '), src.indexOf('const addOneOff = '));
    expect(sweep).toContain('setSwept(lines);');
    expect(sweep).toContain('sweepWholeMs(lines.length) + MOTION_SLACK_MS');
  });

  it('sweeps the last trip off when a line put on an "All done" list starts the next one', () => {
    const start = src.indexOf('const addOneOff = async (title: string) => {');
    const body = src.slice(start, src.indexOf('const toggle = async', start));
    // the same write every add goes through, which finishes an "All done" trip first
    expect(body).toContain(
      'const r = await putOnList(db, systemClock, { ...w, ...tripDays(timeZone), title: clean });',
    );
    // swept only when it finished one, from the basket as it was drawn — and felt as nothing more
    expect(body).toContain('if (r.finished !== null) sweepOff(clearFeel(was, still).swept);');
    expect(body.match(/haptic\(/g) ?? []).toHaveLength(0);
    // and the toast says the trip it ended, with the Undo that puts that trip back
    expect(body).toContain(
      'sayPutOn(toast, SHOPPING.added(clean), r.finished, trip => putBackTrip(db, systemClock, { ...w, trip }), );',
    );
  });

  it('shows an empty cart over the words the empty list always had, once a sweep has finished', () => {
    // and never from a list not read yet (2026-10-08: the empty cart flashed before the list)
    expect(src).toContain('{ready && lines.length === 0 && swept.length === 0 ? (');
    expect(src).toContain('const ready = read && suppliesRead;');
    expect(src).toContain(
      '<EmptyState icon="cart" art={<EmptyCart testID="shopping.empty.art" />} title={SHOPPING.emptyTitle}',
    );
    expect(src).toContain('testID="shopping.empty"');
  });

  it('draws the lines where they are placed, and counts them as they are', () => {
    expect(src).toContain(
      'const shown = placeLines(lines, settling.places, settling.gliding, swept, away);',
    );
    expect(src).toContain('const groups = groupByShop(shown.toBuy);');
    expect(src).toContain("{shown.basket.map(l => rowFor(l, 'shopping.basket'))}");
    // every number on the page reads the lines themselves
    expect(src).toContain('SHOPPING.progress(basket.length, lines.length)');
    expect(src).toContain('SHOPPING.subtitle(open.length)');
    expect(src).toContain('SHOPPING.itemCount(g.lines.length)');
    expect(src).toContain('SHOPPING.clear(basket.length)');
    // and Clear takes what is in the basket as it is written, read by the write itself
    expect(src).toContain('toast.show(SHOPPING.tripSaved(trip.lineIds.length, trip.left), {');
  });

  it('tells the tour first, then does what the plan says, on the plan’s clock', () => {
    const start = src.indexOf('const share = () => {');
    const body = src.slice(start, src.indexOf('const rowFor', start));
    const did = body.indexOf("tour?.did('share');");
    expect(did).toBeGreaterThan(-1);
    // reported before anything is thrown, felt or sent (core's `TourAction` `share`)
    const run = body.indexOf('shares.tap(planeLaunch(t.reduceMotion, t.theme), send);');
    expect(run).toBeGreaterThan(did);
    // one button for the life of the screen, acting through the screen's own hands
    expect(src).toContain(
      'const [shares] = useState(() => shareButton({ feel: haptic, throwPlane: n => setPlane(n), later: (fn, ms) => void setTimeout(fn, ms), }), );',
    );
    // the platform's sheet is asked for in one place, and only ever through the plan
    expect(body.split('Share.share(').length - 1).toBe(1);
    expect(body).not.toContain('send()');
    // every haptic is the plan's, at its moment: none typed here
    expect(body).not.toMatch(/haptic\(/);
  });

  it('lets a second tap go while the plane is in the air: one plane and one sheet per tap', () => {
    const start = src.indexOf('const share = () => {');
    const body = src.slice(start, src.indexOf('const rowFor', start));
    const guard = body.indexOf('if (shares.waiting()) return;');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("tour?.did('share');"));
    // the sheet waits for the plane, not for a clock of the screen's own
    expect(body).not.toContain('setTimeout(');
  });

  it('throws the plane over the page from the Share button, without taking it out of the tour’s ring', () => {
    // the button as it was, in a view that is only what the plane measures on the throw
    expect(src).toContain(
      '<View ref={shareAt} collapsable={false}> <TourSpot id={TOUR_ANCHOR.shopShare} radius={t.radius.pill}> <Button label={SHOPPING.share} icon="share" variant="secondary" size="sm" onPress={share} testID="shopping.share" /> </TourSpot> </View>',
    );
    expect(src).toContain('const shareAt = useRef<View>(null);');
    // drawn in the page's overlay, over every card, and nowhere else — not in the scroller, which
    // clipped the first plane at the top bar's edge
    const overlay = src.slice(
      src.indexOf('overlay={'),
      src.indexOf('<View style={[styles.titleRow'),
    );
    // and its landing is what the share sheet waits for
    expect(overlay).toContain(
      '<PaperPlane launch={plane} from={shareAt} at={planeOrigin(t.space.xl, SHARE_GLYPH, t.hit.min)} onLanded={shares.landed} />',
    );
    expect(src.split('<PaperPlane').length - 1).toBe(1);
  });

  it('keeps every id a flow or the tour reaches', () => {
    for (const id of [
      'testID="shopping.share"',
      'testID="shopping.list"',
      'testID="shopping.basket"',
      'testID="shopping.progress"',
      'testID="shopping.clear"',
      'testID="shopping.add"',
      'testID="shopping.add.picker"',
      "rowFor(l, 'shopping.line')",
      "rowFor(l, 'shopping.basket')",
    ])
      expect(src, id).toContain(id);
  });
});

describe('a shopping line, wired (tripwires over ListRow.tsx)', () => {
  const src = code('ListRow.tsx');

  it('draws its tick with the mark that draws itself, in the ink the check always had', () => {
    expect(src).toContain(
      '<TickMark checked={checked} size={15} color={a.onAccent} ring={TICK / 2} burst={burst} burstColor={a.accent} dots={dots} dotColor={dotInk} undraw />',
    );
    expect(src).not.toContain('<Icon name="check"');
    // the dots in the thing's own ink — its category's, as its square is drawn — or the accent
    expect(src).toContain("const cat = useCategory(categoryModule(item?.category ?? ''));");
    expect(src).toContain('const dotInk = oneOff ? a.accent : cat.fg;');
  });

  it('fills the circle and clears it, on the native driver, set where it rests when nothing may move', () => {
    expect(src).toContain('const fill = useRef(new Animated.Value(checked ? 1 : 0)).current;');
    expect(src).toContain(
      'if (!changed || still) { fill.setValue(checked ? 1 : 0); return undefined; }',
    );
    expect(src).toContain('delay: checked ? 0 : TICK_FILL.outDelay,');
    expect(src).toContain('useNativeDriver: true');
    expect(src).not.toContain('useNativeDriver: false');
    // the ring stays under it; the old switched background is gone
    expect(src).toContain('borderColor: t.color.line2,');
    expect(src).not.toContain("backgroundColor: checked ? a.accent : 'transparent'");
  });

  it('draws the line through a ticked line’s words across them, and rests on the platform’s own', () => {
    expect(src).toContain(
      "<StrikeText variant=\"bodyStrong\" ink={checked ? 'text2' : 'text'} numberOfLines={2} struck={checked} >",
    );
  });

  it('keeps the tick mounted when the line is ticked: one tree, the tick first in the row', () => {
    // the old early return for a ticked line mounted a NEW tick, already ticked, with nothing to draw
    expect(src).not.toMatch(/if \(checked\) \{ return/);
    // `!readOnly` since 2026-10-08: a view only member's line never slides (`ListRow.readOnly`)
    const row = src.indexOf('<SwipeRow enabled={!checked && !readOnly}');
    expect(row).toBeGreaterThan(-1);
    expect(src.indexOf('{tick}', row)).toBeGreaterThan(row);
    const square = src.indexOf(
      '{item !== null ? ( <View ref={iconRef} collapsable={false}> <CategorySquare category={item.category} /> </View> ) : ( <View style={styles.iconGap} /> )}',
      row,
    );
    expect(src.indexOf('{tick}', row)).toBeLessThan(square);
    // still a checkbox, with its label and its id
    expect(src).toContain('accessibilityRole="checkbox" accessibilityState={{ checked }}');
    expect(src).toContain('testID={`${testID}.tick`}');
  });

  it('keeps the words in one place in the tree, so the line through them is drawn, not swapped', () => {
    // the square comes and goes in a slot of its own; the words are always in the one Pressable,
    // which is a button only while it opens the supply, and otherwise no element of its own
    const row = src.indexOf('<SwipeRow enabled={!checked}');
    const square = src.indexOf(
      '<CategorySquare category={item.category} /> </View> ) : ( <View style={styles.iconGap} /> )}',
      row,
    );
    const press = src.indexOf('<Pressable accessible={opens}', row);
    expect(square).toBeGreaterThan(row);
    expect(press).toBeGreaterThan(square);
    expect(src.indexOf('{body} </Pressable>', press)).toBeGreaterThan(press);
    expect(src.split('{body}').length - 1).toBe(1);
    expect(src).toContain('const opens = !checked && !oneOff && onOpen !== undefined;');
    expect(src).toContain(': { disabled: true })}');
  });

  it('keeps every control’s id', () => {
    // every line uses the stepper; its last − is `.qty.remove` (the owner, 2026-10-03).
    // Swipe Remove stays `.remove`. No trailing `.more`.
    for (const id of ['.tick`', '.qty.', '.remove`', '.open`']) expect(src, id).toContain(id);
    expect(src).toContain(
      "testID={`${testID}.qty.${dir > 0 ? 'up' : removes ? 'remove' : 'down'}`}",
    );
    expect(src).not.toContain('.x`');
    expect(src).not.toContain('testID={`${testID}.more`}');
  });

  it('leaves the sparkle room inside the row and the card round it', () => {
    // a 24 pt circle, `space.lg` in from the card, `space.md` of padding over a one-line row and
    // `space.md` before the text; the card's hairline is the last point of the room
    const tick = Number(/const TICK = (\d+);/.exec(read('ListRow.tsx'))?.[1]);
    expect(tick).toBe(24);
    expect(src).toContain(
      'paddingHorizontal: t.space.lg, paddingVertical: t.space.md, gap: t.space.md',
    );
    const ring = tick / 2;
    const room = Math.min(space.lg + ring, space.md + ring, ring + space.md) - 1;
    expect(rayReach(ring)).toBeLessThanOrEqual(room);
    // the dots too
    expect(dotReach(ring)).toBeLessThanOrEqual(room);
    // and the rays start clear of the circle they sparkle round
    expect(RAY_GAP).toBeGreaterThan(0);
  });
});

describe('the batch of 2026-09-26, wired (tripwires over ShoppingScreen.tsx and ListRow.tsx)', () => {
  const src = code('ShoppingScreen.tsx');
  const row = code('ListRow.tsx');
  // the app's one swipe, which the row slides through since 2026-09-29 (packages/ui)
  const swipe = readFileSync(
    join(here, '..', '..', '..', '..', '..', 'packages', 'ui', 'src', 'components', 'SwipeRow.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

  it('S1: raises the lines once per run of the app, decided as the list is first drawn as read', () => {
    expect(src).toContain('const { lines, read } = useShopping();');
    expect(src).toContain(
      'if (intro === null && read && !covered && shoppingIntro.due()) setIntro( introDelays([...groups.flatMap(g => g.lines.map(l => l.id)), ...shown.basket.map(l => l.id)]), );',
    );
    // taken once it is decided, whatever the list held, and over once the last line has landed
    expect(src).toContain('if (intro === null) return undefined; shoppingIntro.take();');
    expect(src).toContain('(still ? 0 : enterWholeMs(intro.size)) + MOTION_SLACK_MS');
    expect(src).toContain("motion === 'enter' ? (intro?.get(l.id) ?? 0)");
    expect(src).toContain('intro: intro === null ? NO_IDS : new Set(intro.keys()),');
    // the first read is told from the empty list a screen starts with, by identity
    const lists = readFileSync(join(here, '../../lists/useLists.ts'), 'utf8');
    expect(lists).toContain('read: rows !== NOT_READ');
  });

  it('S2: throws the thing into the basket’s heading on the tap, which bounces as it lands — felt as nothing more', () => {
    const start = src.indexOf('const tick = async (id: string, checked: boolean) => {');
    const body = src.slice(start, src.indexOf('await tickShoppingItem(', start));
    expect(body).toContain('if (feel.drop) dropIntoBasket(id, line);');
    // one haptic per tick, and it is the feel's
    expect(body.match(/haptic\(/g) ?? []).toHaveLength(1);
    const drop = src.slice(
      src.indexOf('const dropIntoBasket = '),
      src.indexOf('const setQty = async'),
    );
    expect(drop).toContain('from: iconAt.current.get(id) ?? null, to: basketAt,');
    expect(drop).toContain('chip: <ThrownChip category={item?.category ?? null} />,');
    expect(drop).toContain(
      'later(() => { setDrops(list => list.filter(d => d.id !== n)); setBasketBump(b => b + 1); }, CART_LAND_MS);',
    );
    expect(drop).not.toContain('haptic(');
    expect(src).toContain('<CartFlight throws={covered ? NO_DROPS : drops} />');
    expect(src).toContain(
      '<CartBounce bump={basketBump}> <View ref={basketAt} collapsable={false} testID="shopping.basket.cart"> <Icon name="cart" size={15} color={t.color.text2} /> </View> </CartBounce>',
    );
    // the heading is there for the throw from the tap; its card with the first line drawn in it
    expect(src).toContain('{shown.basket.length > 0 || basket.length > 0 || drops.length > 0 ? (');
    expect(src).toContain('{shown.basket.length > 0 ? ( <View');
    expect(row).toContain('ref={oneOff ? iconRef : undefined}');
    expect(row).toContain('<View ref={iconRef} collapsable={false}>');
  });

  it('S3: rolls "N to buy" as a tap here lands, wherever the list says how many are left', () => {
    expect(src).toContain(
      'const said = owedDraw(owed, open.length); if (said !== owed) setOwed(said);',
    );
    expect(src).toContain(
      '<CountRoll variant="meta" ink="text2" value={open.length} bump={said.roll}> {SHOPPING.subtitle(open.length)} </CountRoll>',
    );
    const start = src.indexOf('const tick = async (id: string, checked: boolean) => {');
    const body = src.slice(start, src.indexOf('await tickShoppingItem(', start));
    // noted on the tap, before the write; let go if no write pays it
    expect(body).toContain('setOwed(o => owedTap(o, feel.finish));');
    expect(body).toContain('setOwed(owedLapse); }, OWED_MS);');
    expect(body.indexOf('owedTap')).toBeLessThan(body.indexOf('await context()'));
    expect(code('parts.tsx')).toContain(
      '<CountRoll variant="caption" ink="text2" accessibilityRole="header" value={count.value} bump={count.bump} >',
    );
  });

  it('S4: rolls the cart and says "All done" for the tick here that empties the list, and only while it stays so', () => {
    expect(src).toContain('const doneLive = !covered && open.length === 0;');
    expect(src).toContain(
      '<AllDoneWords run={said.done} live={doneLive} delay={DONE_AFTER_MS}> {SHOPPING.allDone} </AllDoneWords>',
    );
    expect(src).toContain('<AllDoneCart run={said.done} live={doneLive} delay={DONE_AFTER_MS} />');
    // inside the progress card, beside its line: the card goes with a cleared list, and all with it
    const card = src.slice(
      src.indexOf('<Card testID="shopping.progress" radius="l">'),
      src.indexOf('</Card>', src.indexOf('<Card testID="shopping.progress" radius="l">')),
    );
    expect(card).toContain('<AllDoneCart');
    expect(card).toContain('<AllDoneWords');
  });

  it('S5: takes a swiped line off with the same write and the same Undo, and draws it going once it is off', () => {
    const start = src.indexOf('const removeLine = async (id: string, title: string) => {');
    const body = src.slice(start, src.indexOf('const clear = async () => {', start));
    const write = body.indexOf(
      'const r = await removeShoppingItem(db, systemClock, { ...w, itemId: id });',
    );
    expect(write).toBeGreaterThan(-1);
    const committed = body.indexOf('if (!r.committed) return;');
    expect(committed).toBeGreaterThan(write);
    // drawn going only once the write has landed, and never when nothing may move
    expect(body.indexOf('setAway(')).toBeGreaterThan(committed);
    expect(body).toContain('const going = !still && was !== undefined;');
    // the Undo it always had, after the going has been drawn, on a timer the screen does not own
    expect(body).toContain('toast.show(SHOPPING.removed(title), {');
    expect(body).toContain(
      'void restoreShoppingItems(db, systemClock, { ...w, itemIds: [id] }).then(() => toast.show(SHOPPING.undone), );',
    );
    expect(body).toContain('Math.max(0, gone - Date.now()),');
    expect(src).toContain('onRemove={() => void removeLine(l.id, l.title)}');
    // and every way the row takes a line off goes through it: the swipe is the app's one swipe
    // (packages/ui `SwipeRow`), let go far enough INTO its action here, and felt once there
    expect(row).toContain('<SwipeRow enabled={!checked && !readOnly} removes backing="always"');
    expect(row).toContain('onAction={() => onRemove()}');
    expect(swipe).toContain(
      'const end = swipeRelease(at, g.vx, width.current, SWIPE_OPEN, removesNow.current);',
    );
    expect(swipe).toContain(
      "open.current = false; swipes.home(id); haptic('tap'); act.current(handle);",
    );
    expect(swipe.match(/haptic\(/g) ?? []).toHaveLength(1);
    expect(row.match(/haptic\(/g) ?? []).toHaveLength(0);
    // remove is the swipe's action and the stepper's ✕ at quantity 1 (no one-off-only ✕ since 2026-10-03)
    expect(row).toContain('onAction={() => onRemove()}');
    expect(row).toContain('onPress={() => (removes ? onRemove() : onQty(line.qty + dir))}');
    expect(row).not.toContain('SHOPPING.removeItem');
    expect(row).not.toContain('name="more"');
  });

  it('S5: keeps a remove a screen reader reaches without the gesture, and no gesture library', () => {
    // the Remove behind the row is a labeled button, never hidden from assistive technology:
    // drawn whenever the line can swipe (`backing="always"`), in the swipe's own backing
    expect(row).toContain('accessibilityLabel={SHOPPING.removeLine(name)} onAction=');
    expect(swipe).toContain("const behind = enabled && (backing === 'always' || out !== null);");
    const behind = swipe.slice(
      swipe.indexOf('styles.behind'),
      swipe.indexOf('</View>', swipe.indexOf('styles.behind')),
    );
    expect(behind).toContain('accessibilityRole="button" accessibilityLabel={accessibilityLabel}');
    expect(behind).not.toContain('accessibilityElementsHidden');
    expect(behind).not.toContain('importantForAccessibility');
    expect(row).toContain('actionTestID={`${testID}.remove`}');
    expect(swipe).toContain('testID={actionTestID}');
    // React Native's own responder: no new native module
    expect(swipe).toContain('PanResponder.create({');
    for (const f of ['ListRow.tsx', 'ShoppingScreen.tsx'])
      expect(code(f)).not.toMatch(/['"]react-native-(gesture-handler|reanimated)['"]/);
    expect(swipe).not.toMatch(/['"]react-native-(gesture-handler|reanimated)['"]/);
    const mobile = readFileSync(join(here, '../../../package.json'), 'utf8');
    expect(mobile).not.toMatch(/react-native-(gesture-handler|reanimated)/);
    // the row slides on the native driver; the gap is RowMotion's
    expect(row).not.toContain('useNativeDriver: false');
    expect(swipe).not.toContain('useNativeDriver: false');
  });
});

describe('the supplies page, wired (tripwires over SuppliesScreen.tsx)', () => {
  const src = code('SuppliesScreen.tsx');

  it('throws on the tap, before the write, on its own clock — felt once, bouncing and counting at the landing', () => {
    const start = src.indexOf(
      "const toggle = async (item: SupplyItem, from: 'plus' | 'sheet') => {",
    );
    const body = src.slice(start, src.indexOf('const openNew', start));
    const thrown = body.indexOf("if (from === 'plus') throwToCart(item, toBuy);");
    expect(thrown).toBeGreaterThan(-1);
    // the write every add goes through (`putOnList`: it finishes an "All done" trip first)
    expect(thrown).toBeLessThan(body.indexOf('await putOnList('));
    // taking one OFF the list throws nothing, as it always did
    expect(thrown).toBeGreaterThan(body.indexOf("if (intent.action === 'remove') {"));
    // only a row's + throws: the supply sheet's switch is under a sheet, and felt as it flips
    expect(src).toContain("onPress={() => void toggle(x, 'plus')}");
    expect(src).toContain("'sheet', )");
    expect(src).toContain('runAddToList(cartLanding(t.reduceMotion, t.theme), { feel: haptic,');
    expect(src).toContain(
      'land: () => { setThrows(list => list.filter(y => y.id !== id)); setCart(cartLanded); setBump(n => n + 1); },',
    );
    // one haptic per add, and only the plan's
    expect(src.match(/haptic\(/g) ?? []).toHaveLength(0);
  });

  it('flies over the page to the cart on the shopping list card, which bounces and whose count rolls', () => {
    expect(src).toContain('overlay={<CartFlight throws={throws} />}');
    expect(src).toContain('<CartBounce bump={bump}> <View ref={cartAt} collapsable={false}');
    // rolled by a landing and nothing else: the count read in as the page opens is simply set
    expect(src).toContain('<CountRoll variant="bodyStrong" value={shows} bump={bump}>');
    expect(src).toContain('const shows = cartShows(cart, toBuy);');
    // each + hands its own box to the throw, from the control itself
    expect(src).toContain('pressRef={node => {');
    expect(read('parts.tsx')).toContain('ref={pressRef}');
  });

  it('reads the list as it is to a screen reader, and says in the toast where the thing went', () => {
    expect(src).toContain(
      'accessibilityLabel={`${SHOPPING.screenTitle}, ${ toBuy > 0 ? SUPPLIES.listCount(toBuy) : SUPPLIES.listCountNone }`}',
    );
    // …and, when the add started a new list, the trip it ended beside it with an Undo (`sayPutOn`)
    expect(src).toContain('sayPutOn(toast, SUPPLIES.addedToList(label), r.finished,');
    // the same line pops when the parent is back on the list
    expect(src).toContain(
      "if (r.committed) tour?.did('shop:add'); if (r.committed) arrivals.note(r.itemId);",
    );
  });

  it('carries the count on the cart’s corner, the held number the words roll to (the owner, 2026-09-26)', () => {
    // "the cart has no count badge ... add this feature": inside the cart's own box, so it rides the
    // bounce, bumping on the same landing; hidden at zero and from a screen reader by the badge
    // itself (packages/ui `cartBadge.test.ts`), because the card's own name says the count
    expect(src).toContain(
      '<CartBadge count={shows} bump={bump} ground={a.tint} testID="supplies.list.cart.badge" />',
    );
    const cart = src.slice(
      src.indexOf('testID="supplies.list.cart"'),
      src.indexOf('</CartBounce>'),
    );
    expect(cart).toContain('<CartBadge');
  });

  it('throws the thing’s own square, ringed in its category’s ink', () => {
    // the chip is shared with the shopping list's drop into its basket, so it lives in parts.tsx
    expect(src).toContain('chip: <ThrownChip category={x.category} />,');
    const parts = code('parts.tsx');
    expect(parts).toContain("const cat = useCategory(categoryModule(category ?? ''));");
    expect(parts).toContain('borderColor: cat.fg');
    expect(parts).toContain('<CategorySquare category={category} size={SQUARE_SM} />');
  });

  it('keeps every id a flow or the tour reaches, and names the cart', () => {
    for (const id of [
      'testID="supplies"',
      'testID="supplies.add"',
      'testID="supplies.list"',
      'testID="supplies.list.cart"',
      'testID="supplies.sort"',
      'testID="supplies.card"',
      'testID="supplies.note"',
      'testID={`supplies.toggle.${x.id}`}',
      'testID={`supplies.item.${x.id}`}',
    ])
      expect(src, id).toContain(id);
  });
});

describe('the rows keep themselves when the list moves (tripwires over parts.tsx)', () => {
  it('keys each row’s wrapper by the row’s own key, not by where it stands', () => {
    const src = code('parts.tsx');
    expect(src).toContain(
      '<View key={isValidElement(child) && child.key !== null ? child.key : `row-${i}`}>',
    );
    expect(src).toContain('{i > 0 ? <Divider inset={ROW_INSET} /> : null}');
  });
});

// (CuddleCue's chores checklist, `TasksScreen.tsx`, is not in NibbleCue; its wiring checks went with it.)
