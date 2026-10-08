/**
 * THE APP'S ONE SWIPE, AS NUMBERS AND RULES (2026-09-29). A row slid to the left shows an action
 * behind it: the shopping list's Remove (S5, 2026-09-26) and, since the owner's request of
 * 2026-09-29, the log's Delete — *"In today's log history (home last section), add the ability where
 * user can swipe or bring the log row to the left and it shows the button option to delete. But have
 * confirmation pop up are you sure you want to delete this log (name)?"*. `SwipeRow.tsx` hands a
 * finger's travel to these and draws what they return; this file is pure, so node holds every rule
 * (`swipeRow.test.ts`).
 *
 * IT WAS THE SHOPPING ROW'S OWN (`ListRow.tsx`, its release in the app's `listMotion.ts`). A second
 * list with a second copy would have been two swipes that drift apart the first time either was
 * tuned, so both lists slide through here now and feel the same under a thumb.
 *
 * THREE THINGS:
 *
 *  1. WHEN A MOVE IS THE SWIPE (`swipeClaims`): never on contact, and only once the finger has gone
 *     `SWIPE_CLAIM` points sideways and further sideways than down. A vertical drag anywhere on a
 *     list scrolls the page, which is what a finger on a list is nearly always doing.
 *  2. WHERE THE ROW GOES WHEN IT IS LET GO (`swipeRelease`): back to rest, open on its action, or —
 *     only for a row whose swipe TAKES its action (`removes`, the shopping list) — straight into it.
 *     The log's row never does: its Delete asks first, so the furthest swipe only opens it.
 *  3. ONE ROW OUT AT A TIME, anywhere in the app (`swipes`). A row that comes out sends the one out
 *     before it home; a touch on another row, or anywhere in a list or page that says so, sends it
 *     home too, and a page that scrolls or goes out of view sends every row home.
 */
import { ROW_AWAY_MS } from './rowMotion';

/** How far left the row travels to show its action: the action's own width, 44 pt twice over. */
export const SWIPE_OPEN = 88;
/** Past this, a finger moving sideways has committed to the swipe and the page stops scrolling. */
export const SWIPE_CLAIM = 12;
/** Past this share of its width, a row whose swipe takes its action is let go into it (S5). */
export const SWIPE_REMOVE_SHARE = 0.5;
/**
 * A flick at least this fast — points per ms — once the action is showing counts as far; a flick
 * back to the right this fast shuts the row, however far out it was.
 */
export const SWIPE_FLING = 0.8;
/** How long a row let go takes to slide home, or out onto its action. */
export const SWIPE_SETTLE_MS = 140;
/**
 * A row let go into its action that is still here this long after — its write did not land, so its
 * screen never drew it going (`RowMotion`'s `away`) — slides back home rather than being left half
 * off its card.
 */
export const SWIPE_BACK_MS = ROW_AWAY_MS + 300;

/** Where a swiped row goes when the finger lets it go. */
export type SwipeEnd = 'rest' | 'open' | 'remove';

/** WHETHER A MOVE ON A ROW IS THE SWIPE: `SWIPE_CLAIM` sideways, and half as much again as down. */
export function swipeClaims(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_CLAIM && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * WHERE THE ROW STANDS UNDER THE FINGER: `from` is where the drag began (0 at rest, `-open` open),
 * `dx` how far the finger has gone. Left only, and never past the row's own width — or, before the
 * row has been measured, past its action.
 */
export function swipeFollow(from: number, dx: number, width: number, open = SWIPE_OPEN): number {
  const far = width > 0 ? width : open;
  return Math.min(0, Math.max(-far, from + dx));
}

/**
 * WHERE A SWIPED ROW GOES WHEN IT IS LET GO: `at` is where the row stands (0 at rest, less than 0
 * to the left), `vx` the finger's speed as it let go (points per ms, left negative), `width` the
 * row's own, `open` how far out the action is showing.
 *
 *  - SHUT on a flick back to the right, however far out it was: the finger changed its mind.
 *  - FAR past half its width, or on a flick left once the action is showing — never on a twitch
 *    under a thumb that was scrolling, which the row does not even claim. A row whose swipe takes
 *    its action (`removes`) is let go into it; any other stops open on it, so an action that asks
 *    first is only ever a tap away and never taken by the swipe itself.
 *  - OPEN, showing the action, past half of the action's width; otherwise back at rest.
 *
 * A row not yet measured is only ever far on a flick.
 */
export function swipeRelease(
  at: number,
  vx: number,
  width: number,
  open: number,
  removes = true,
): SwipeEnd {
  if (vx >= SWIPE_FLING) return 'rest';
  const far = width > 0 && at <= -width * SWIPE_REMOVE_SHARE;
  if (far || (at < -open && vx <= -SWIPE_FLING)) return removes ? 'remove' : 'open';
  return at < -open / 2 ? 'open' : 'rest';
}

/* --------------------------------------------------------------------- one row out at a time */

/**
 * THE ROWS OUT OF THEIR PLACES, which is never more than one. A row reports itself out when a
 * finger takes it and when it comes to rest open (`out`), and home when it is back or gone (`home`).
 * Everything else here is a reason for the one row out to go home.
 */
export interface SwipeRegistry {
  /** A fresh id for a row, once for its life. */
  nextId(): number;
  /** Row `id` is out of its place. Whichever row was out before it goes home. */
  out(id: number, shut: (animated: boolean) => void): void;
  /** Row `id` is home, or gone. */
  home(id: number): void;
  /**
   * A touch began on row `id` (its capture phase). True when ANOTHER row was out: it goes home, and
   * the touch is spent on that — the tap does not also open or tick the row it landed on, the way a
   * phone's own lists treat a tap while a row's actions are showing.
   */
  touchRow(id: number): boolean;
  /**
   * A touch began somewhere in an area that closes rows (a page's content, a list). Once the touch
   * has been dispatched — every row it landed on has said so through `touchRow` by then — a row out
   * that it did NOT land on goes home. Nothing is spent: the touch does what it was going to do.
   */
  touchArea(): void;
  /** Every row home: the page scrolled, or it went out of view. */
  shutAll(animated?: boolean): void;
  /** The row out now, if any. */
  current(): number | null;
}

/**
 * `later` runs a check once the touch in hand has been dispatched: a microtask on a phone, where a
 * touch's capture handlers all run in one synchronous pass; a hand-turned queue in a test.
 */
export function createSwipeRegistry(
  later: (run: () => void) => void = run => void Promise.resolve().then(run),
): SwipeRegistry {
  let ids = 0;
  let open: { id: number; shut: (animated: boolean) => void } | null = null;
  /** The row the touch in hand landed on, as far as its capture has said. */
  let landed: number | null = null;
  let checking = false;
  const shutOpen = (animated: boolean): void => {
    const was = open;
    if (was === null) return;
    open = null;
    was.shut(animated);
  };
  return {
    nextId: () => (ids += 1),
    out(id, shut) {
      if (open !== null && open.id !== id) shutOpen(true);
      open = { id, shut };
    },
    home(id) {
      if (open !== null && open.id === id) open = null;
    },
    touchRow(id) {
      landed = id;
      if (open === null || open.id === id) return false;
      shutOpen(true);
      return true;
    },
    touchArea() {
      landed = null;
      // nothing out, nothing to check: every touch on Today passes through here, and costs nothing
      if (open === null || checking) return;
      checking = true;
      later(() => {
        checking = false;
        if (open !== null && landed !== open.id) shutOpen(true);
        landed = null;
      });
    },
    shutAll(animated = true) {
      shutOpen(animated);
    },
    current: () => open?.id ?? null,
  };
}

/** The app's one registry: at most one row is out anywhere, on any page. */
export const swipes: SwipeRegistry = createSwipeRegistry();
