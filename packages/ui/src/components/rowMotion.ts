/**
 * A LIST ROW ARRIVING, MOVING AND LEAVING, as numbers (the owner, 2026-09-26: *"add animation in
 * shopping list to make it more fun"*). Pure TypeScript, tested in node like `rollDown.ts`;
 * `RowMotion.tsx` and `StrikeSweep.tsx` only hand these numbers to `Animated.Value#interpolate`.
 *
 * NINE MOVES, five in and four out, each short and each out of the way of the next tap:
 *
 *   pop    a line just put on the list: its room opens (the rows under it slide down rather than
 *          jump) while the row itself grows out of the middle of it, from 85% to a hair past full
 *          and settling, and fades in. 400 ms.
 *   drop   a line arriving in the basket from the list above: its room opens and the row comes
 *          down into it, fading in. 300 ms.
 *   rise   a line arriving back in the list from the basket below: the same, coming up. 300 ms.
 *   slide  a day arriving from the side (the Schedule's Next day card opened, 2026-09-26): its
 *          room opens as the rows come in from the right — the way time goes — fading in. 320 ms.
 *          Folded again it leaves by `sweep`, off to the right, back the way it came.
 *   sink   a line leaving the list for the basket: it slips down out of its room as the room
 *          closes (the rows under it slide up), fading. 300 ms, alongside the `drop` of the same
 *          line in the basket — so the line is seen to go down from one to the other.
 *   lift   a line leaving the basket for the list: the same, going up. 300 ms.
 *   sweep  a line cleared from the basket: it is swept off to the side, fading, and then its room
 *          closes. 240 ms each, the lines going one after another (`sweepStagger`).
 *   enter  a line already on the list, the first time the list is opened (2026-09-26, S1): it rises
 *          a few points into its place, fading in. Its room is there from the first frame — it has
 *          no room to open, so nothing round it moves (`rowHasRoom`). 240 ms, the lines one after
 *          another so the whole list has landed within 400 (`enterStagger`).
 *   away   a line swiped off the list (2026-09-26, S5): it carries on off the left edge from
 *          wherever the finger let it go, fading, and its room closes behind it. 320 ms.
 *
 * TWO VALUES, TWO DRIVERS, as `RollDown` has. A row's room is a HEIGHT, which is layout, so it runs
 * on the JavaScript driver; everything the eye follows — the slide, the sweep, the pop's scale and
 * the fades — is a transform or an opacity on the native driver, on its own value started on the
 * same clock. Every curve is SAMPLED into the frames (every 10 ms) and the values run linearly, so
 * the two drivers read the same curve and the pop can carry a spring's overshoot that no bezier has.
 *
 * WHEN NOTHING MOVES (`motionStill`, reduce motion and the amber Night) none of this plays: a row
 * is simply there or not, in the place it belongs.
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/* ------------------------------------------------------------------------------- the moves */

export type RowEnter = 'pop' | 'drop' | 'rise' | 'enter' | 'slide';
export type RowExit = 'sink' | 'lift' | 'sweep' | 'away';
export type RowMotionKind = RowEnter | RowExit;

export const ROW_ENTERS: readonly RowEnter[] = ['pop', 'drop', 'rise', 'enter', 'slide'];
export const ROW_EXITS: readonly RowExit[] = ['sink', 'lift', 'sweep', 'away'];

export const isRowExit = (k: RowMotionKind): k is RowExit =>
  (ROW_EXITS as readonly string[]).includes(k);

/**
 * WHETHER A MOVE HAS A ROOM — a height that opens or closes, moving the rows round it. Every move
 * but `enter` does. An `enter` is a line that was already on the list, drawn for the first time:
 * its room is simply there, so the list is laid out once and only the row itself moves in it.
 */
export const rowHasRoom = (k: RowMotionKind): boolean => k !== 'enter';

/** A line just put on the list. */
export const ROW_POP_MS = 400;
/** A line going to the basket, or back from it: its leaving and its arriving run side by side. */
export const ROW_GLIDE_MS = 300;
/** One cleared line, swept off. */
export const ROW_SWEEP_MS = 240;
/** One line of a list opened for the first time, rising into its place. */
export const ROW_ENTER_MS = 240;
/** A line swiped off the list: off the edge, then its room closed. */
export const ROW_AWAY_MS = 320;
/** A day's list coming in from the side: a little longer than a glide, since it travels further. */
export const ROW_SLIDE_MS = 320;

export const rowMotionMs = (k: RowMotionKind): number => {
  switch (k) {
    case 'pop':
      return ROW_POP_MS;
    case 'sweep':
      return ROW_SWEEP_MS;
    case 'enter':
      return ROW_ENTER_MS;
    case 'away':
      return ROW_AWAY_MS;
    case 'slide':
      return ROW_SLIDE_MS;
    default:
      return ROW_GLIDE_MS;
  }
};

/** Every curve here is sampled this often. */
export const ROW_STEP_MS = 10;

/* ------------------------------------------------------------------------------ the curves */

/** The room opening: the sheet's own curve (DESIGN_SYSTEM §7), a quick start and a soft landing. */
export const ROOM_OPEN_EASE = [0.22, 0.8, 0.28, 1] as const;
/** The room closing, and a line slipping out of it: even in, even out. */
export const ROOM_CLOSE_EASE = [0.45, 0, 0.55, 1] as const;
/** The sweep: it starts off slowly and is gone quickly, as a swipe of the hand is. */
export const SWEEP_EASE = [0.5, 0, 0.9, 0.6] as const;
/**
 * A swiped line carrying on off the edge: already moving under the finger, so it leaves at speed
 * and eases out — a start from rest here would read as the row stopping before it goes.
 */
export const AWAY_EASE = [0.2, 0.6, 0.4, 1] as const;

/** How much of the pop's time its room takes to open: the rest is the row settling. */
export const POP_ROOM_MS = 240;

/** How far a line gliding in or out travels, as a share of its own height. */
export const GLIDE_SLIDE = 0.6;
/** How far past its own width a swept line goes, in points, so none of it is left at the edge. */
export const SWEEP_PAST = 24;
/** How far below its place a line of a list opened for the first time starts, in points. */
export const ENTER_RISE = 12;
/** How much of the swipe-away's time the line takes to go off the edge; its room closes after. */
export const AWAY_OFF = 0.55;
/**
 * How far to the right a sliding day starts, as a share of its own width: far enough to be read as
 * coming from the side — the next day, after this one — and not so far that the words are a blur.
 */
export const SLIDE_FROM = 0.35;

/**
 * THE POP: from `POP_FROM` of its size toward full on a spring — `POP_DAMPING` of critical, so it
 * passes full once and comes back, the overshoot a couple of percent — first reaching full as the
 * room finishes opening. The spring is tapered to exactly full by the end of the pop, so nothing
 * is left to snap.
 */
export const POP_FROM = 0.85;
export const POP_DAMPING = 0.5;
/** When the spring first reaches full size, in ms: as its room finishes opening. */
export const POP_FULL_MS = 210;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The pop's scale at `ms`. */
export function popScaleAt(ms: number): number {
  if (ms <= 0) return POP_FROM;
  if (ms >= ROW_POP_MS) return 1;
  const z = POP_DAMPING;
  const root = Math.sqrt(1 - z * z);
  // the damped frequency that first crosses full at `POP_FULL_MS`: ωd·t = π − atan(root / z)
  const wd = (Math.PI - Math.atan2(root, z)) / (POP_FULL_MS / 1000);
  const wn = wd / root;
  const t = ms / 1000;
  const off =
    (1 - POP_FROM) * Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / root) * Math.sin(wd * t));
  // the last fifth of the pop draws what is left of the spring in to nothing
  const taper = clamp((ROW_POP_MS - ms) / (ROW_POP_MS * 0.2), 0, 1);
  return 1 - off * taper;
}

/* ------------------------------------------------------------------------------ the frames */

export interface RowFrames {
  /** Of the JavaScript-driven value: the row's room, in points. */
  height: Frame;
  /** Of the native-driven value: what the eye follows. */
  opacity: Frame;
  x: Frame;
  y: Frame;
  scale: Frame;
}

const sampleTimes = (ms: number): number[] => {
  const out: number[] = [];
  for (let t = 0; t < ms; t += ROW_STEP_MS) out.push(t);
  out.push(ms);
  return out;
};

const sampled = (ms: number, value: (t: number) => number): Frame => {
  const times = sampleTimes(ms);
  return {
    inputRange: times.map(t => t / ms),
    outputRange: times.map(value),
    extrapolate: 'clamp',
  };
};

/** `[from, to]` of the move's time, eased on `ease`: 0 before, 1 after. */
const eased =
  (ms: number, from: number, to: number, ease: readonly [number, number, number, number]) =>
  (t: number): number =>
    easeAt(ease, clamp((t - from * ms) / ((to - from) * ms), 0, 1));

/**
 * The frames of one move for a row `height` tall and `width` wide, over its value 0 → 1 (which is
 * 0 → `rowMotionMs(kind)`). A size not yet measured is none: the room stays shut.
 */
export function rowFrames(kind: RowMotionKind, height: number, width: number): RowFrames {
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const ms = rowMotionMs(kind);
  const still = (v: number): Frame => ({
    inputRange: [0, 1],
    outputRange: [v, v],
    extrapolate: 'clamp',
  });
  switch (kind) {
    case 'pop': {
      const room = eased(ms, 0, POP_ROOM_MS / ms, ROOM_OPEN_EASE);
      return {
        height: sampled(ms, t => h * room(t)),
        // the row stays centered in its room as the room opens round it
        y: sampled(ms, t => (h * room(t) - h) / 2),
        x: still(0),
        scale: sampled(ms, popScaleAt),
        opacity: sampled(ms, eased(ms, 0.08, 0.45, ROOM_CLOSE_EASE)),
      };
    }
    case 'drop':
    case 'rise': {
      const room = eased(ms, 0, 1, ROOM_OPEN_EASE);
      const from = (kind === 'drop' ? -1 : 1) * GLIDE_SLIDE * h;
      return {
        height: sampled(ms, t => h * room(t)),
        y: sampled(ms, t => from * (1 - room(t))),
        x: still(0),
        scale: still(1),
        opacity: sampled(ms, eased(ms, 0, 0.6, ROOM_CLOSE_EASE)),
      };
    }
    case 'slide': {
      // the room and the slide on the one curve, so the rows land in their place as it finishes
      // opening round them
      const room = eased(ms, 0, 1, ROOM_OPEN_EASE);
      return {
        height: sampled(ms, t => h * room(t)),
        x: sampled(ms, t => SLIDE_FROM * w * (1 - room(t))),
        y: still(0),
        scale: still(1),
        opacity: sampled(ms, eased(ms, 0, 0.6, ROOM_CLOSE_EASE)),
      };
    }
    case 'sink':
    case 'lift': {
      const gone = eased(ms, 0, 1, ROOM_CLOSE_EASE);
      const to = (kind === 'sink' ? 1 : -1) * GLIDE_SLIDE * h;
      return {
        height: sampled(ms, t => h * (1 - gone(t))),
        y: sampled(ms, t => to * gone(t)),
        x: still(0),
        scale: still(1),
        opacity: sampled(ms, t => 1 - eased(ms, 0, 0.7, ROOM_CLOSE_EASE)(t)),
      };
    }
    case 'sweep': {
      const away = eased(ms, 0, 0.8, SWEEP_EASE);
      return {
        // the room holds while the line goes, then closes behind it
        height: sampled(ms, t => h * (1 - eased(ms, 0.5, 1, ROOM_CLOSE_EASE)(t))),
        y: still(0),
        x: sampled(ms, t => (w + SWEEP_PAST) * away(t)),
        scale: still(1),
        opacity: sampled(ms, t => 1 - eased(ms, 0.25, 0.8, ROOM_CLOSE_EASE)(t)),
      };
    }
    case 'enter': {
      const land = eased(ms, 0, 1, ROOM_OPEN_EASE);
      return {
        // no room to open: this is what the room is, and `RowMotion` never sets it (`rowHasRoom`)
        height: still(h),
        y: sampled(ms, t => ENTER_RISE * (1 - land(t))),
        x: still(0),
        scale: still(1),
        opacity: sampled(ms, eased(ms, 0, 0.6, ROOM_CLOSE_EASE)),
      };
    }
    case 'away': {
      // LEFT, the way the finger sent it, from wherever the finger let it go: the row's own
      // translate is the finger's, and this one carries on from there, a full width and a little
      const off = eased(ms, 0, AWAY_OFF, AWAY_EASE);
      return {
        height: sampled(ms, t => h * (1 - eased(ms, AWAY_OFF - 0.1, 1, ROOM_CLOSE_EASE)(t))),
        y: still(0),
        x: sampled(ms, t => -(w + SWEEP_PAST) * off(t)),
        scale: still(1),
        opacity: sampled(ms, t => 1 - eased(ms, 0.15, AWAY_OFF, ROOM_CLOSE_EASE)(t)),
      };
    }
  }
}

/* ------------------------------------------------------------------------------ the intro */

/** A list opened for the first time: its lines rise in one after another, this far apart… */
export const ENTER_STAGGER_MS = 30;
/** …and the last of them has landed within this, however long the list is. */
export const ENTER_WHOLE_MS = 400;

/**
 * THE GAP BETWEEN TWO LINES RISING IN: `ENTER_STAGGER_MS`, closed up for a long list so the last
 * line has landed by `ENTER_WHOLE_MS` — six lines at the full gap; twenty at 8 ms, which on a
 * phone is the lines below the fold starting together, unseen.
 */
export function enterStagger(n: number): number {
  if (n <= 1) return 0;
  return Math.min(ENTER_STAGGER_MS, (ENTER_WHOLE_MS - ROW_ENTER_MS) / (n - 1));
}

/** How long the rise of `n` lines takes, from the first frame to the last line landed. */
export const enterWholeMs = (n: number): number =>
  n <= 0 ? 0 : ROW_ENTER_MS + (n - 1) * enterStagger(n);

/* ------------------------------------------------------------------------------ the sweep */

/** Cleared lines go one after another, this far apart. */
export const SWEEP_STAGGER_MS = 35;
/** And the whole basket is gone within this, however much was in it. */
export const SWEEP_WHOLE_MS = 450;

/**
 * THE GAP BETWEEN TWO CLEARED LINES: `SWEEP_STAGGER_MS`, closed up for a big basket so the last
 * line has gone by `SWEEP_WHOLE_MS` — a trip of seven sweeps at the full gap; twelve at 19 ms.
 */
export function sweepStagger(n: number): number {
  if (n <= 1) return 0;
  return Math.min(SWEEP_STAGGER_MS, (SWEEP_WHOLE_MS - ROW_SWEEP_MS) / (n - 1));
}

/** How long a sweep of `n` lines takes, from the tap to the last one gone. */
export const sweepWholeMs = (n: number): number =>
  n <= 0 ? 0 : ROW_SWEEP_MS + (n - 1) * sweepStagger(n);

/* ------------------------------------------------------------------------- the first look */

/**
 * A LIST SEEN FOR THE FIRST TIME: its rows come in one after another (the Schedule's day, once an
 * app session; the owner, 2026-09-26). Not an arrival — the rows are already laid out where they
 * belong, and nothing under them moves — so there is no room here, only what the eye follows:
 * each row rises `LOOK_RISE` into its place as it fades in, on the native driver alone
 * (`StaggerIn`). The whole list is in within `LOOK_WHOLE_MS` however long it is.
 */
export const LOOK_MS = 220;
/** How far below its place a row starts, in points. */
export const LOOK_RISE = 8;
/** The gap between two rows' starts, for a short list. */
export const LOOK_STAGGER_MS = 40;
/** And the last row of any list is in by this. */
export const LOOK_WHOLE_MS = 400;

/** The gap between two rows' starts: `LOOK_STAGGER_MS`, closed up so `n` rows fit the whole. */
export function lookStagger(n: number): number {
  if (n <= 1) return 0;
  return Math.min(LOOK_STAGGER_MS, (LOOK_WHOLE_MS - LOOK_MS) / (n - 1));
}

/** How long `n` rows take to come in, from the first one's start to the last one settled. */
export const lookWholeMs = (n: number): number => (n <= 0 ? 0 : LOOK_MS + (n - 1) * lookStagger(n));

/** One row's first look, over its value 0 → 1: the rise on the sheet's curve, and the fade. */
export function lookFrames(): { opacity: Frame; y: Frame } {
  const ms = LOOK_MS;
  const settle = eased(ms, 0, 1, ROOM_OPEN_EASE);
  return {
    y: sampled(ms, t => LOOK_RISE * (1 - settle(t))),
    opacity: sampled(ms, eased(ms, 0, 0.7, ROOM_CLOSE_EASE)),
  };
}

/* ----------------------------------------------------------------------------- the strike */

/**
 * THE STRIKE-THROUGH, DRAWN ACROSS: when a line is ticked the line through its words sweeps from
 * the left edge to the right; when it is unticked it is taken back, right to left. It starts a
 * beat after the tick so the pen is seen to start in the circle, and it is done before the row
 * moves on (`SETTLE_MS` in the app's `listMotion.ts`).
 */
export const STRIKE_DELAY_MS = 60;
export const STRIKE_MS = 240;
export const UNSTRIKE_MS = 200;
/** A pen's curve: under way at once, slowing as it reaches the end of the words. */
export const STRIKE_EASE = [0.3, 0.2, 0.3, 1] as const;

export interface StrikeWindows {
  /** The words WITH the line, seen from the left edge to the pen: the window's and its content's slide. */
  struckOuter: Frame;
  struckInner: Frame;
  /** The words WITHOUT it, seen from the pen to the right edge. */
  plainOuter: Frame;
  plainInner: Frame;
}

/**
 * The two windows the words are seen through while the pen is on them, for words `width` wide,
 * over the pen's place 0 → 1 (0 the left edge, 1 the right). Each window is a clip that slides
 * one way while what is inside it slides back the other, so the words stand still and only the
 * edge between the two moves: the struck words from 0 to the pen, the plain ones from the pen to
 * the end. Together they are the whole of the words at every place, and never any of them twice.
 */
export function strikeWindows(width: number): StrikeWindows {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const f = (a: number, b: number): Frame => ({
    inputRange: [0, 1],
    outputRange: [a, b],
    extrapolate: 'clamp',
  });
  return {
    struckOuter: f(-w, 0),
    struckInner: f(w, 0),
    plainOuter: f(0, w),
    plainInner: f(0, -w),
  };
}
