/**
 * THE RUNNING TIMERS AS ONE STACK (the owner, 2026-09-26: *"running more than 3 timer at the same
 * time makes the display full. try doing this: The stack. Two hero for the timer you're most likely
 * to act on; the rest collapse into an "Also running" card with compact rows using the same flat
 * circular icons as the Log chips. 440px becomes ~270px, and Up Next is now on screen. Fixes the
 * wall and the visual-language mismatch at once."*). Pure TypeScript, so the order and the height
 * are node tests (`timerStack.test.ts`, and the app's `stack.test.ts` for the fold).
 *
 * TWO HEROES (the owner, 2026-09-27: *"the hero (also running) should show 2 full background timer,
 * but if running 3, then it should show the also running for the third"*). The first build read
 * "two hero" as a slip for one; it was not. So:
 *
 *   - ONE TIMER RUNNING: its card, exactly as ever.
 *   - TWO: two whole cards, each with its own picture, its own words and its own held stop.
 *   - THREE OR MORE: the first two as cards, and every other one as a 44 pt row of ONE "Also
 *     running" card — the Log's flat chip, the household's word for the module (with the baby's
 *     name when there is more than one), and the elapsed, ticking. A row OPENS its timer's own
 *     sheet, where it is stopped; it carries no stop of its own, because a stop one mis-tap away in
 *     a list of rows is how a two-hour nap ends at twenty minutes.
 *
 * Two cards cost what the owner's ~270 did not: two of them are 208 pt before a row is drawn, and
 * a feed's card is 160 of its own. The app measures what that does to Up next
 * (`apps/mobile/src/screens/today/stack.test.ts`) rather than this file promising it.
 *
 * THE ORDER IS WHEN EACH ONE STARTED, the first started first (the owner, 2026-09-27: *"the more i
 * think about it, the more it makes no sense to sort based on the breastfeeding -> pumping ->
 * sleeping, i think it should still be sorted based on which one you start first"*). It replaces
 * the kind order of the day before — a feed, then a pump, then a sleep, then playtime — and with it
 * the one thing that order could not promise: a list that stays where it is. A timer that starts
 * joins the END of the stack, so nothing already on the screen moves when another begins; only a
 * corrected start time, which really does change which began first, can move one. A tie — two
 * started in the same millisecond, twins put down together by one tap on Both — is broken by id,
 * so two phones draw the same stack.
 *
 * THE STICKY TIMER BAR TAKES THE SAME ORDER, so the timer at the top of the page is the one at the
 * top of the strip that replaces it on the way down.
 */
import { hit } from '../theme/theme';
import { announceElapsed } from './timeFormat';

/** How many running timers Today draws as whole cards before the rest become rows. */
export const HERO_CARDS = 2;

/** What the order reads off a running timer. */
export interface StackTimer {
  id: string;
  /** Epoch ms. Earlier started first. */
  startedAtMs: number;
}

/** The comparison: the one started first, then the id. */
export function byStart(a: StackTimer, b: StackTimer): number {
  return a.startedAtMs - b.startedAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The running timers in the stack's order — a new array; the caller's is left as it was. */
export function stackOrder<T extends StackTimer>(timers: readonly T[]): T[] {
  return [...timers].sort(byStart);
}

export interface TimerStack<T> {
  /** The ones drawn as whole cards, first started first: none, one, or `HERO_CARDS`. */
  heroes: T[];
  /** Every other one, in order: the rows of "Also running". Empty for two timers or fewer. */
  also: T[];
}

/** The stack: the first two started as cards, the rest as rows. */
export function timerStack<T extends StackTimer>(timers: readonly T[]): TimerStack<T> {
  const order = stackOrder(timers);
  return { heroes: order.slice(0, HERO_CARDS), also: order.slice(HERO_CARDS) };
}

/**
 * THE "ALSO RUNNING" CARD'S GEOMETRY, in points at 1× type — the numbers `AlsoRunning` lays out
 * with and the app's fold arithmetic adds up (`apps/mobile/src/screens/today/layout.ts`), so the
 * two cannot drift. A row is the tap target and no taller; the card pads its top for the label and
 * lets the last row's own 44 be its foot, because the 32 pt chip centered in 44 already leaves six
 * points of air under it.
 */
export const ALSO_RUNNING = {
  /** Above the label: `space.sm`. */
  top: 6,
  /** The label's line: `label` type, 10 pt, set on 13. */
  label: 13,
  /** One row: `hit.min`, the whole row a target. */
  row: hit.min,
} as const;

/** The card's height at 1× type for `rows` compact rows; nothing at all for none. */
export const alsoRunningHeight = (rows: number): number =>
  rows <= 0 ? 0 : ALSO_RUNNING.top + ALSO_RUNNING.label + rows * ALSO_RUNNING.row;

/** The card's own word for what it holds. */
export const ALSO_RUNNING_TITLE = 'Also running';

/**
 * WHAT A ROW SAYS: the household's word for the module — "Playtime" once tummy time has graduated
 * — and the baby's name after it only where there is somebody else it could be ("Sleep · Liam").
 * A pump is the parent's, and its caller never passes a name for it.
 */
export function alsoRunningTitle(word: string, childName?: string): string {
  const who = childName?.trim();
  return who ? `${word} · ${who}` : word;
}

/**
 * A ROW'S ACCESSIBLE NAME: the timer, whose it is, how long it has run in words — never glyphs —
 * and whether a feed is paused. It moves with the minute, not the second (`announceElapsed`), so a
 * screen reader resting on a row is not re-read on every tick.
 */
export function alsoRunningSpoken(input: {
  word: string;
  childName?: string;
  elapsedMs: number;
  paused: boolean;
}): string {
  const who = input.childName?.trim();
  return `${input.word} timer${who ? ` for ${who}` : ''}, ${announceElapsed(input.elapsedMs)}${
    input.paused ? ', paused' : ''
  }`;
}
