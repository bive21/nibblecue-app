/**
 * WHAT A TICK DOES BESIDES THE WRITE, on the two lists that tick — the household checklist and the
 * shopping list (the owner, 2026-09-25, of the "that's cool" list: *"might not necessarily be
 * useful, but it's cool … Let's try doing everything. I will then review"*). Pure, so every rule
 * here is tested in node (`listMotion.test.ts`) and the screens only call it.
 *
 * THREE THINGS, all decided at the moment of the tap:
 *
 *  1. WHAT IS FELT. A tick is a `tap`; the tick that leaves nothing open on its list is a
 *     `success` instead — one pattern, not both, because two patterns a few milliseconds apart are
 *     felt as one smeared buzz. Unticking is felt as nothing: it "just clears".
 *  2. WHETHER THE SPARKLE PLAYS. Only for the tick that finishes the list, only for the parent's
 *     own tap (a tick arriving from the other phone is drawn, never celebrated or felt), and never
 *     under reduce motion or in the amber night, where nothing moves (`motionStill`). The haptic
 *     is not motion, so it stays.
 *  3. HOW LONG THE TICKED ROW KEEPS ITS PLACE. A ticked line leaves the shopping list for the
 *     basket, and a "just once" chore leaves Today — and a row that leaves the moment it is ticked
 *     takes the drawing of its tick with it, somewhere the thumb is not. So a row ticked here stays
 *     where it was, ticked, until the stroke has landed (and the sparkle, for the last one) and a
 *     beat after; then the list settles. Every tick in the meantime restarts the wait
 *     (`useSettling`), so a parent ticking down a list in a shop never has rows moving under the
 *     finger they are aiming with — they all move together once the parent pauses. Under reduce
 *     motion nothing is drawn, so nothing waits: the row moves on the tap, as it always did.
 *
 * NOTHING HERE IS ABOUT THE BABY: "finished" is a list's own count of open lines, never a number
 * from the log (the batch's rule: no praise tied to the baby's numbers).
 *
 * AND WHAT A TAP ON THE SHOPPING LIST'S SHARE DOES BESIDES SENDING (`shareButton`, 2026-09-26): the
 * paper plane's plan (`planeLaunch` in packages/ui) carried out across the button's taps — so that
 * the share sheet opens only once the plane has gone, once per tap, is proved here, in node, on a
 * clock the test turns by hand.
 *
 * AND THE SHOPPING LIST'S OWN MOTION (the owner, 2026-09-26: *"add animation in shopping list to
 * make it more fun"*, and *"Shopping: adding from Supplies flies the item into the list, and the
 * cart bounces."*). The shopping list goes further than the checklist, so its rules are its own
 * (`lineFeel`) and the checklist's (`tickFeel`) are untouched:
 *
 *  - A TICK throws a few dots in the thing's own color round the circle (the one that finishes the
 *    list keeps its rays), draws the line through its words, and — once the list settles — GLIDES
 *    to the basket: out of the list as it drops into the basket (`placeLines`, `lineMotion`).
 *  - AN UNTICK RUNS IT ALL BACK, without the dots: the tick lifts off, the circle clears, the line
 *    through the words is taken back, and the row keeps its place in the basket for that before it
 *    glides back up to the list (`UNSETTLE_MS`).
 *  - A LINE PUT ON THE LIST on this phone POPS into its place when the list is next in front of
 *    the parent (`lists/arrivals.ts`, `freshArrivals`, `arrivalDelays`).
 *  - CLEAR sweeps the basket off to the side, one line after another, felt once (`clearFeel`).
 *  - THE SUPPLIES PAGE THROWS what a + adds into its cart, which bounces as its count rolls: all
 *    of it on the tap's own clock (`runAddToList`, `cartShows`), whatever the drawing manages.
 *
 * AND THE BATCH AFTER IT (the owner, 2026-09-26: *"try everything, if i dont like it, i will ask you
 * to remove"*):
 *
 *  - S1, THE FIRST OPEN: the first time the list is opened in a run of the app, its lines rise into
 *    their places one after another, the whole list landed within 400 ms (`introDelays`,
 *    `lists/intro.ts`). Never again that session.
 *  - S2, INTO THE BASKET: a tick here throws the thing's own picture from its row into the "In the
 *    basket" heading, which bounces as it lands (`lineFeel`'s `drop`) — before the line itself
 *    glides down after it, as it always did.
 *  - S3, THE COUNT: "N to buy" rolls down a number as a tick here lands, and up for an untick
 *    (`owedTap`, `owedDraw`); a count that changes any other way is simply set.
 *  - S4, THE LAST ONE: the tick here that empties the list, once it has landed and the line has
 *    settled into the basket, sends a little cart along the progress line and "All done" up where
 *    it stops (`lineFeel`'s `finish`, `DONE_AFTER_MS`). Never for a list empty for any other reason.
 *  - S5, SWIPED AWAY: a line swiped far enough, or flicked, is taken off the list — the same write
 *    and the same Undo as its Remove — and carries on off the edge as its gap closes (`swipeRelease`
 *    in packages/ui, the app's one swipe since 2026-09-29; `placeLines`' `away`).
 *
 * Under reduce motion and in the amber Night none of it moves: lines are where they belong at once,
 * and every haptic is still felt, on the tap.
 */
import { tasksForToday, type ShoppingLine, type TaskRow } from '@nibblecue/core';
import type { HapticKind } from '@nibblecue/ui/haptics';
import {
  BURST_DELAY_MS,
  BURST_MS,
  enterStagger,
  ROW_AWAY_MS,
  ROW_GLIDE_MS,
  TICK_DRAW_MS,
  TICK_UNDRAW_MS,
  UNSTRIKE_MS,
  type CartLanding,
  type PlaneLaunch,
  type RowMotionKind,
} from '@nibblecue/ui/layout';

/** A line on a list, as far as ticking is concerned: which one, and whether it is still to do. */
export interface Tickable {
  id: string;
  open: boolean;
}

/**
 * WOULD TICKING `id` FINISH THE LIST — is it the last open one? True only for a line that is open
 * now while every other line is already done; a list of one finishes with its one tick. A line
 * already ticked, or one not on the list, finishes nothing.
 */
export function finishesList(list: readonly Tickable[], id: string): boolean {
  const hit = list.find(x => x.id === id);
  return hit !== undefined && hit.open && list.every(x => x.id === id || !x.open);
}

/**
 * The beat after the flourish before the list settles: long enough to see the tick land, short
 * enough that nobody is left waiting for a row to get out of the way.
 */
const SETTLE_BEAT_MS = 280;
/** A ticked row keeps its place while its stroke draws, and a beat after. */
export const SETTLE_MS = TICK_DRAW_MS + SETTLE_BEAT_MS;
/** The tick that finishes the list keeps it for its sparkle too, which ends later than the stroke. */
export const SETTLE_LAST_MS = BURST_DELAY_MS + BURST_MS + SETTLE_BEAT_MS;

export interface TickFeel {
  /** The haptic to play on the tap, or null for none. */
  haptic: 'tap' | 'success' | null;
  /** Whether the sparkle plays round this tick as it draws. */
  burst: boolean;
  /** How long the ticked row keeps its place, from the tap; 0 moves it at once. */
  settleMs: number;
}

/**
 * What a tap on a tick does besides writing it: `next` is the state it is going to, `list` the
 * list as it is before the tap, `still` whether nothing may move (`motionStill`).
 */
export function tickFeel(
  list: readonly Tickable[],
  id: string,
  next: boolean,
  still: boolean,
): TickFeel {
  // unticking just clears it: nothing felt, nothing drawn, nothing held
  if (!next) return { haptic: null, burst: false, settleMs: 0 };
  const last = finishesList(list, id);
  return {
    haptic: last ? 'success' : 'tap',
    burst: last && !still,
    settleMs: still ? 0 : last ? SETTLE_LAST_MS : SETTLE_MS,
  };
}

/** The shopping list as a list of ticks: a line is open while it is not in the basket. */
export const shoppingTicks = (lines: readonly ShoppingLine[]): Tickable[] =>
  lines.map(l => ({ id: l.id, open: l.checkedAt === null }));

/** Which card a shopping line is drawn in: the list to buy, or the basket under it. */
export type LinePlace = 'toBuy' | 'basket';

const NO_PLACES: ReadonlyMap<string, LinePlace> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();
const NO_LINES: readonly ShoppingLine[] = [];

/**
 * A line taken off the list here a moment ago, still drawn while it goes (S5): the line as it was,
 * and where in the list it stood — the list without it, it is drawn back in at that place.
 */
export interface AwayLine {
  line: ShoppingLine;
  at: number;
}
const NO_AWAY: readonly AwayLine[] = [];

/** Where a line belongs at rest: to buy while it is open, in the basket once it is ticked. */
export const restPlace = (l: Pick<ShoppingLine, 'checkedAt'>): LinePlace =>
  l.checkedAt === null ? 'toBuy' : 'basket';

/** Where a line is drawn now: where it is held, or where it belongs. */
const drawnAt = (l: ShoppingLine, held: ReadonlyMap<string, LinePlace>): LinePlace =>
  held.get(l.id) ?? restPlace(l);

/**
 * The card a gliding line is LEAVING, while it is drawn in two: the one it was held in when the
 * list settled, if that is not where it is drawn now. Null for every line not on its way anywhere.
 */
const leavingFrom = (
  l: ShoppingLine,
  held: ReadonlyMap<string, LinePlace>,
  gliding: ReadonlyMap<string, LinePlace>,
): LinePlace | null => {
  const from = gliding.get(l.id);
  return from === undefined || from === drawnAt(l, held) ? null : from;
};

/**
 * WHERE EACH SHOPPING LINE IS DRAWN while some are on the move. With nothing moving this is
 * exactly `stillToBuy` and `inTheBasket`, in the list's own order.
 *
 *  - HELD: a line tapped here a moment ago stays in the card it was in when it was tapped — a tick
 *    in the list to buy, ticked; an untick in the basket, unticked — while its tick is drawn or
 *    taken back (`useSettling`). A tap never moves a line: it goes where it belongs once the parent
 *    pauses, with every other line tapped meanwhile.
 *  - GLIDING: once the list settles, a line that was held somewhere it no longer belongs is drawn
 *    in BOTH cards for the length of a glide — leaving the one it was held in as it arrives in the
 *    other (`lineMotion`). A line held where it belongs anyway (ticked and unticked again before the
 *    list settled) glides nowhere.
 *  - SWEPT: the lines Clear has just taken are still drawn in the basket, from the snapshot the tap
 *    took, while they are swept off it. A line both swept and still read from the list (its write
 *    not yet landed) is drawn once, as the swept one.
 *  - AWAY: a line taken off the list here a moment ago is drawn back in the place it stood, from
 *    its snapshot, while it goes off the edge and its gap closes. Drawn once, like a swept one.
 *
 * It decides WHERE a line is drawn and nothing else. Every count on the screen — the subtitle,
 * "2 of 6 in the basket", what Clear takes and what Share sends — reads the lines as they are.
 */
export function placeLines(
  lines: readonly ShoppingLine[],
  held: ReadonlyMap<string, LinePlace>,
  gliding: ReadonlyMap<string, LinePlace> = NO_PLACES,
  swept: readonly ShoppingLine[] = NO_LINES,
  away: readonly AwayLine[] = NO_AWAY,
): { toBuy: ShoppingLine[]; basket: ShoppingLine[] } {
  const gone = new Set([...swept.map(l => l.id), ...away.map(a => a.line.id)]);
  const live = lines.filter(l => !gone.has(l.id));
  // each back where it stood, the earliest place first, so a later one counts the earlier in
  for (const a of [...away].sort((x, y) => x.at - y.at))
    live.splice(Math.max(0, Math.min(a.at, live.length)), 0, a.line);
  const shownIn = (place: LinePlace) => (l: ShoppingLine) =>
    drawnAt(l, held) === place || leavingFrom(l, held, gliding) === place;
  return {
    toBuy: live.filter(shownIn('toBuy')),
    basket: [...swept, ...live.filter(shownIn('basket'))],
  };
}

/** What is moving on the list right now, as the screen holds it. */
export interface ListMotionNow {
  /** Lines kept where they were tapped, and where. */
  held: ReadonlyMap<string, LinePlace>;
  /** Lines the last settle let go, and the card each was held in. */
  gliding: ReadonlyMap<string, LinePlace>;
  /** Lines put on the list on this phone, popping into their places. */
  popping: ReadonlySet<string>;
  /** Lines Clear is sweeping off the basket. */
  swept: ReadonlySet<string>;
  /** Lines taken off the list here, going off the edge (S5). */
  away: ReadonlySet<string>;
  /** Lines rising into their places the first time the list is opened (S1). */
  intro: ReadonlySet<string>;
}

export const LIST_AT_REST: ListMotionNow = {
  held: NO_PLACES,
  gliding: NO_PLACES,
  popping: NO_IDS,
  swept: NO_IDS,
  away: NO_IDS,
  intro: NO_IDS,
};

/**
 * WHAT A LINE IS DOING WHERE IT IS DRAWN (`RowMotion` plays it): taken off the list and going off
 * its edge; swept off the basket; gliding — down out of the list and into the basket for a tick, up
 * out of the basket and into the list for an untick; popping into its place, just added; rising
 * into it, the first time the list is opened; or at rest. A line held where it was tapped is at
 * rest there — a move already under way on it finishes (`RowMotion` never cuts an arrival short).
 * A line just added pops rather than rises: the pop is the news.
 */
export function lineMotion(
  l: ShoppingLine,
  place: LinePlace,
  now: ListMotionNow,
): RowMotionKind | null {
  if (now.away.has(l.id)) return 'away';
  if (place === 'basket' && now.swept.has(l.id)) return 'sweep';
  const from = leavingFrom(l, now.held, now.gliding);
  if (from !== null && place === from) return from === 'toBuy' ? 'sink' : 'lift';
  if (now.held.has(l.id)) return null;
  if (from !== null) return place === 'basket' ? 'drop' : 'rise';
  if (place === 'toBuy' && now.popping.has(l.id)) return 'pop';
  return now.intro.has(l.id) ? 'enter' : null;
}

/**
 * WHERE EACH CHORE IS DRAWN while some are settling. A "just once" chore is due until it is done
 * (`dueToday`), so ticking it would take it off Today at once; one ticked here a moment ago is
 * PLACED as if it were still open — in its own slot by `tasksForToday`'s order — and DRAWN as it
 * is, ticked. With nothing settling this is exactly `tasksForToday` and the chores it leaves out.
 */
export function placeTasks(
  tasks: readonly TaskRow[],
  weekday: number,
  settling: ReadonlySet<string>,
): { today: TaskRow[]; later: TaskRow[] } {
  const byId = new Map(tasks.map(x => [x.id, x]));
  const placed = tasksForToday(
    tasks.map(x => (settling.has(x.id) ? { ...x, lastDoneOn: null } : x)),
    weekday,
  );
  const today = placed.map(x => byId.get(x.id) ?? x);
  const onToday = new Set(today.map(x => x.id));
  return { today, later: tasks.filter(x => !onToday.has(x.id)) };
}

/* ------------------------------------------------------------ the shopping list's own tick */

/**
 * THE TICK'S CIRCLE ON THE SHOPPING LIST, which fills and clears rather than switching (`ListRow`):
 * on a tick the accent grows out of the middle of the ring, from 55% to a hair past full, and
 * settles; on an untick it runs the same way back — a small swell, then smaller and gone — once
 * the stroke has begun to lift off it, so the stroke is never left white on nothing.
 */
export const TICK_FILL = {
  /** The fill's whole move, either way. */
  inMs: 150,
  outMs: 170,
  /** How long an untick waits for the stroke before the fill goes. */
  outDelay: 70,
  /** The size it grows from, and the size past full it swells to on the way. */
  from: 0.55,
  peak: 1.06,
} as const;

/** The fill's scale and opacity over its value: 0 empty, 1 full. Run backwards, it clears. */
export function tickFillFrames(): {
  scale: { inputRange: number[]; outputRange: number[] };
  opacity: { inputRange: number[]; outputRange: number[] };
} {
  return {
    scale: { inputRange: [0, 0.7, 1], outputRange: [TICK_FILL.from, TICK_FILL.peak, 1] },
    opacity: { inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] },
  };
}

/**
 * HOW LONG AN UNTICKED LINE KEEPS ITS PLACE IN THE BASKET: while its tick runs back, its circle
 * clears and the line through its words is taken back, and a beat after — then it glides up.
 */
const UNSETTLE_BEAT_MS = 180;
export const UNSETTLE_MS =
  Math.max(TICK_FILL.outDelay + TICK_FILL.outMs, TICK_UNDRAW_MS, UNSTRIKE_MS) + UNSETTLE_BEAT_MS;

/** A line let go by the settle is drawn gliding for this long: out of one card as it comes into the other. */
export const GLIDE_MS = ROW_GLIDE_MS;

export interface LineFeel extends TickFeel {
  /** Whether a few dots are thrown round this tick as it draws, in the ink of the thing ticked. */
  dots: boolean;
  /** Whether the thing's picture is thrown from its row into the basket's heading (S2). */
  drop: boolean;
  /** Whether this tick empties the list: once it lands, the cart rolls and "All done" (S4). */
  finish: boolean;
}

/**
 * WHAT A TAP ON A SHOPPING LINE'S TICK DOES BESIDES THE WRITE: the checklist's rules (`tickFeel`),
 * and the list's own.
 *
 *  - EVERY TICK THROWS ITS DOTS but the one that finishes the list, which keeps its rays — one
 *    sparkle per tick, never both.
 *  - EVERY TICK DROPS the thing into the basket's heading (S2) — and the landing is felt as
 *    nothing more: the tap was felt, and one haptic is all a tick gets.
 *  - THE TICK THAT FINISHES THE LIST owes the list its cart and its "All done" (S4), once it lands.
 *  - AN UNTICK IS HELD in the basket while it runs back (`UNSETTLE_MS`) before it glides up —
 *    still felt as nothing, and nothing is thrown.
 *
 * Under reduce motion and in the amber Night nothing is held, drawn or thrown; the haptic stays.
 */
export function lineFeel(
  list: readonly Tickable[],
  id: string,
  next: boolean,
  still: boolean,
): LineFeel {
  const base = tickFeel(list, id, next, still);
  return next
    ? { ...base, dots: !base.burst && !still, drop: !still, finish: base.burst }
    : { ...base, dots: false, drop: false, finish: false, settleMs: still ? 0 : UNSETTLE_MS };
}

/* ---------------------------------------------------------------------- the first open */

/**
 * WHEN EACH LINE RISES IN, the first time the list is opened (S1): in the order they are drawn,
 * `enterStagger` apart, so the whole list has landed within `ENTER_WHOLE_MS` however long it is.
 */
export function introDelays(ids: readonly string[]): Map<string, number> {
  const gap = enterStagger(ids.length);
  return new Map(ids.map((id, i) => [id, Math.round(i * gap)]));
}

/* ---------------------------------------------------------- what a tap here owes the words */

/**
 * WHAT THE PARENT'S OWN TAPS OWE THE WORDS ABOUT THE LIST (S3 and S4). A tap is on this phone at
 * once; the count it changes is the database's, a moment later, when its write lands and the list
 * is read again. So a tap leaves a note — a roll owed, and for the tick that empties the list, a
 * finish owed — and the list, the next time it is drawn with a different count, pays it:
 *
 *  - `roll` goes up by one with the count, so "N to buy" rolls (`CountRoll` rolls a number only
 *    when a bump comes with it); a count that changes with nothing owed is simply set — the list
 *    read in, a line added or taken off, a tick from the other phone.
 *  - `done` goes up by one when the count reaches nothing with a finish owed, so the cart rolls and
 *    "All done" comes up (`AllDoneCart`) — and never for a list empty for any other reason.
 *
 * Whatever a write never paid lapses a moment later (`owedLapse`, `OWED_MS`), so a tap whose write
 * did not land cannot roll some later change it had nothing to do with.
 */
export interface Owed {
  /** The count of lines to buy as the words last showed it. */
  seen: number;
  /** Changes of it owed a roll, by taps here whose writes have not landed. */
  rolls: number;
  /** A tap here emptied the list, and its write has not landed. */
  finish: boolean;
  /** One per change that rolled: `CountRoll`'s `bump`. */
  roll: number;
  /** One per finish that landed: `AllDoneCart`'s `run`. */
  done: number;
}

/** How long a tap's note waits for its write to land before it lapses. */
export const OWED_MS = 1200;

export const owedStart = (open: number): Owed => ({
  seen: open,
  rolls: 0,
  finish: false,
  roll: 0,
  done: 0,
});

/** A tick or an untick here, before its write: one change owed a roll, and the finish if it is one. */
export const owedTap = (o: Owed, finishes: boolean): Owed => ({
  ...o,
  rolls: o.rolls + 1,
  finish: o.finish || finishes,
});

/**
 * The list drawn with `open` lines to buy. The SAME object when the count has not changed, so a
 * screen that calls this as it renders and sets it only when it differs settles on the next call.
 */
export function owedDraw(o: Owed, open: number): Owed {
  if (open === o.seen) return o;
  const finished = o.finish && open === 0;
  return {
    seen: open,
    rolls: Math.max(0, o.rolls - 1),
    finish: o.finish && !finished,
    roll: o.rolls > 0 ? o.roll + 1 : o.roll,
    done: finished ? o.done + 1 : o.done,
  };
}

/** Nothing owed any more: whatever a write never paid is let go. */
export const owedLapse = (o: Owed): Owed =>
  o.rolls === 0 && !o.finish ? o : { ...o, rolls: 0, finish: false };

/**
 * WHEN THE CART SETS OFF, after the write that empties the list lands (S4): once the finishing
 * tick's sparkle is over and its line has glided into the basket — the list at rest — so the cart
 * rolls on a quiet page rather than through a sparkle and a glide.
 */
export const DONE_AFTER_MS = SETTLE_LAST_MS + ROW_GLIDE_MS;

/* ------------------------------------------------------------------------ swipe to remove */

/*
  WHERE A SWIPED LINE GOES WHEN IT IS LET GO — off the list past half its width or on a flick once
  Remove shows, open on Remove past half of Remove, home otherwise — is the app's one swipe's rule
  since 2026-09-29 (`swipeRelease` in packages/ui `swipeRow.ts`, with `removes` on for this list).
  It was written here for S5; the log's Delete needed the same swipe, and one rule for both is how
  the two lists stay one feel. What stays here is the list's own half of S5: how long a line taken
  off is drawn going.
*/

/** A line taken off here is drawn going for this long, then let go. */
export const AWAY_MS = ROW_AWAY_MS;

/* ---------------------------------------------------------------------------- arrivals */

/**
 * HOW LONG A LINE PUT ON THE LIST ON THIS PHONE STILL POPS when the list first shows it: long
 * enough to add a few things on the Supplies page and come back to the list; not so long that a
 * line added this morning pops at lunch.
 */
export const ARRIVAL_FRESH_MS = 60_000;
/** Lines arriving together pop one after another, this far apart… */
export const ARRIVAL_STAGGER_MS = 60;
/** …and the last of them has started within this, however many there are. */
export const ARRIVAL_SPREAD_MS = 240;

/** When each of the lines arriving together starts its pop, in the order they are drawn. */
export function arrivalDelays(ids: readonly string[]): Map<string, number> {
  const gap =
    ids.length <= 1 ? 0 : Math.min(ARRIVAL_STAGGER_MS, ARRIVAL_SPREAD_MS / (ids.length - 1));
  return new Map(ids.map((id, i) => [id, Math.round(i * gap)]));
}

/* ------------------------------------------------------------------------------- clear */

/**
 * WHAT A TAP ON CLEAR DOES BESIDES THE WRITES: it is felt once, as a thing finished — the trip —
 * and the basket is swept off, one line after another, from a snapshot of it taken on the tap.
 * Under reduce motion and in the amber Night the lines simply go, and it is still felt.
 */
export function clearFeel(
  basket: readonly ShoppingLine[],
  still: boolean,
): { haptic: 'success'; swept: readonly ShoppingLine[] } {
  return { haptic: 'success', swept: still ? NO_LINES : [...basket] };
}

/* ------------------------------------------------------------------- the supplies cart */

/**
 * THE COUNT BESIDE THE SUPPLIES PAGE'S CART while chips are in the air. The line is written on the
 * tap and the list's own count moves at once — but the count belongs to the cart, and a cart that
 * says "4" while the fourth thing is still flying toward it has told the end of the story first.
 * So it holds at the number it had when the first chip was thrown and goes up by one as each
 * lands, and is the list's own count again once nothing is in the air. It never shows more than
 * the list has: a line taken off meanwhile, or a write that did not land, is simply not counted.
 */
export interface CartCount {
  /** The count when the first chip still in the air was thrown; null when none is. */
  base: number | null;
  /** How many of the chips thrown since then have landed. */
  landed: number;
  /** How many are still in the air. */
  inAir: number;
}

export const CART_IDLE: CartCount = { base: null, landed: 0, inAir: 0 };

/** A chip thrown, with the list's own count as it is on the tap. */
export const cartThrown = (c: CartCount, real: number): CartCount =>
  c.inAir === 0 ? { base: real, landed: 0, inAir: 1 } : { ...c, inAir: c.inAir + 1 };

/** A chip landed. */
export const cartLanded = (c: CartCount): CartCount =>
  c.inAir <= 1 ? CART_IDLE : { ...c, landed: c.landed + 1, inAir: c.inAir - 1 };

/** The number the cart shows, given the list's own. */
export const cartShows = (c: CartCount, real: number): number =>
  c.base === null ? real : Math.max(0, Math.min(real, c.base + c.landed));

/** What a + on the Supplies page acts through: the screen's own hands, so their order is proved in node. */
export interface AddMoves {
  /** Feel one haptic (`haptic` on a phone). */
  feel: (kind: HapticKind) => void;
  /** Throw the chip, and hold the cart's count where it is. */
  fly: () => void;
  /** It is in the cart: the cart bounces, and its count goes up by one. */
  land: () => void;
  /** Run `fn` `ms` from now: `setTimeout` on a phone, a clock turned by hand in a test. */
  later: (fn: () => void, ms: number) => void;
}

/**
 * WHAT A + DOES, ON ITS OWN CLOCK (`cartLanding` in packages/ui). With a chip: it is thrown on the
 * tap, and at the landing the add is felt, the cart bounces and its count rolls — together, and
 * whether or not the chip could be drawn. With none (reduce motion, the amber Night): the add is
 * felt on the tap, and the count is simply the list's.
 */
export function runAddToList(landing: CartLanding, moves: AddMoves): void {
  for (const felt of landing.felt) {
    if (felt.at === 0) moves.feel(felt.kind);
    else moves.later(() => moves.feel(felt.kind), felt.at);
  }
  if (!landing.fly) return;
  moves.fly();
  moves.later(moves.land, landing.landAt);
}

/** What the Share button acts through: the screen's own hands, so the order of them can be proved in node. */
export interface ShareHands {
  /** Feel one haptic (`haptic` on a phone). */
  feel: (kind: HapticKind) => void;
  /** Throw plane number `n`: hand it to `PaperPlane`'s `launch`. */
  throwPlane: (n: number) => void;
  /** Run `fn` `ms` from now: `setTimeout` on a phone, a clock turned by hand in a test. */
  later: (fn: () => void, ms: number) => void;
}

/** The Share button, across its taps: one for the life of the screen. */
export interface ShareButton {
  /** A plane is in the air and its sheet is still to come: a tap now is let go. */
  waiting: () => boolean;
  /**
   * A tap on Share, with the plan and the send as they are for this tap. Returns false, and does
   * nothing at all, when it is let go — a plane is still in the air.
   */
  tap: (launch: PlaneLaunch, send: () => void) => boolean;
  /**
   * Plane `n` has gone (`PaperPlane`'s `onLanded`): its sheet is asked for now, if it has not been.
   * A plane that is not the one waiting — an old one, or one already sent for — asks for nothing.
   */
  landed: (n: number) => void;
}

/**
 * WHAT A TAP ON SHARE DOES, ACROSS TAPS (the owner, 2026-09-26: *"make it look more better and feel
 * better"*; and then, on an Android phone: *"can we wait until animation complete, then pop up show
 * up? the plane is still in the 'x of x in (THE) basket' … and when we close the share log it's just
 * gone"*). The plan is `planeLaunch`'s; this carries it out.
 *
 * WITH A PLANE: it is thrown on the tap — the paper is out of the button on the next frame — every
 * haptic is felt at its moment (the first crease a tap, the throw a success), and the sheet WAITS FOR
 * THE PLANE TO BE GONE: it is asked for when `PaperPlane` says the flight has ended. It used to be
 * asked for on a timer, 480 ms into a 900 ms flight; Android's sheet is another activity, so the app
 * paused under it with the plane frozen over the progress card, and on the way back the plane's time
 * had run out and it was simply gone. A timer is kept only as the latest the sheet waits
 * (`shareBy`), for an end that never comes — a list is always sent.
 *
 * WITH NONE (reduce motion, the amber night): the send is felt, and the sheet asked for, on the tap,
 * as it always was.
 *
 * ONE SHEET PER TAP. While a plane is in the air a second tap is let go: it would throw a second
 * plane through the first and ask for a second sheet. The flight's end and the timer both come for
 * the one waiting send and whichever is first takes it; each is tied to its own plane's number, so
 * an old plane's timer can never send for a newer tap. Once the sheet is asked for, the next tap is
 * taken: the platform's sheet is up and modal by then.
 */
export function shareButton(hands: ShareHands): ShareButton {
  let thrown = 0;
  let pending: { n: number; send: () => void } | null = null;
  const landed = (n: number): void => {
    if (pending === null || pending.n !== n) return;
    const { send } = pending;
    pending = null;
    send();
  };
  return {
    waiting: () => pending !== null,
    tap: (launch, send) => {
      if (pending !== null) return false;
      for (const felt of launch.felt) {
        if (felt.at === 0) hands.feel(felt.kind);
        else hands.later(() => hands.feel(felt.kind), felt.at);
      }
      if (!launch.fly) {
        send();
        return true;
      }
      thrown += 1;
      const n = thrown;
      pending = { n, send };
      hands.throwPlane(n);
      hands.later(() => landed(n), launch.shareBy);
      return true;
    },
    landed,
  };
}
