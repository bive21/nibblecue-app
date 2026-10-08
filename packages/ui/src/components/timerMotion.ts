/**
 * THE RUNNING TIMERS' SMALL MOVES, AS NUMBERS (the owner, 2026-09-26, of the delights they asked
 * to keep: *"makes the app look more fun"*). Pure TypeScript, so every pose of every move is a
 * number a node test reads (`timerMotion.test.ts`); `TimerMotion.tsx` only hands these frames to
 * `Animated.Value#interpolate` on the native driver.
 *
 * ONE MOVE IS LEFT, AND IT IS THE SLEEP'S. A "z" leaves the air above the sleeping baby every two
 * and a half seconds, drifting up, swaying, growing and fading, so two or three are in the air at
 * once — drawn over the owner's picture, in the picture's own deepest hue.
 *
 * THE OTHER THREE WENT WITH THE PICTURES THEY WERE MADE FOR (the owner, 2026-09-26, with the new
 * sleeping, pumping and playtime backgrounds: *"keep the zzz animation you have for sleeping, but
 * the pumping animation doesnot mean much, you can remove this especially since you mentioned
 * this can make the app run heavier"*):
 *
 *   - THE PUMP'S TWO BOTTLES, filling on a rhythm and standing at the output form's numbers once
 *     stopped, are gone at the owner's word, with their colors and the form's plumbing into the card.
 *   - THE MOON'S BREATH and THE TUMMY-TIME PUSH-UP moved a feathered window of the old pictures;
 *     the new ones cannot carry either cleanly. The new moon cradles the baby's head, so any window
 *     round it breathes the face and the cloud too — its edge doubles them at three to fourteen
 *     times what the old moon was held to. The new baby lifts one hand to the stacking rings, so a
 *     push grown about the hands carries that hand four pixels across the toy's still peg. Both
 *     were measured before they went (the commit that removed them has the numbers), and the window
 *     machinery went with them: nothing else used it.
 *
 * WHAT IT SAYS. Decoration, hidden from assistive technology and from touch, tied to nothing
 * logged: the rhythm is fixed, whatever the baby is doing (CLAUDE.md §2 rules 3 and 6).
 *
 * WHEN IT MOVES (`timerMoves`): EVERY RUNNING SLEEP, NAP OR NIGHT (the owner, 2026-09-27: *"yes
 * show zzz at night too"*). The "z"s used to rise only for a daytime nap — a sleep started inside
 * the household's day, while the clock was still inside it — and a night's sleep was drawn still,
 * on the reading that a card at night is for glancing at in a dark room. The owner wants the
 * sleeping baby's "z"s whenever the baby is asleep, so the household's day no longer reaches the
 * card at all.
 *
 * WHEN NOTHING MOVES — a separate rule, and a deliberate one that stays: REDUCE MOTION and the
 * AMBER NIGHT theme draw no "z" at all (`motionStill`). Night is the still theme, the one a parent
 * chooses for the dark room: it draws its dim amber version of the picture (2026-09-29), and draws
 * it still.
 */
import type { ArtParts, CardArt } from '../theme/artInk';
import type { ThemeName } from '../theme/theme';
import { anchoredCover, type Rect } from './cardArtFit';
import type { Frame } from './dayNightSwitch';
import { keyValue, type Key } from './keyframes';
import type { TimerType } from './StopButton';
import { motionStill } from './tickDraw';

/* ----------------------------------------------------------------------- when anything moves */

export interface TimerMoves {
  /** The "z"s drift. */
  zs: boolean;
  /** Reduce motion or the amber Night: nothing moves. */
  still: boolean;
}

/**
 * WHAT MOVES ON THIS CARD. `art` is the card's picture as the card draws it — in the amber Night
 * its Night version, which nothing moves on — and a part the picture does not name never moves, so
 * a new artwork with no measured air for the "z"s is simply a still card. A sleep's "z"s drift
 * whatever the hour (see the header); nothing on any other card moves.
 */
export function timerMoves(input: {
  type: TimerType;
  art: CardArt | null;
  theme: ThemeName;
  reduceMotion: boolean;
}): TimerMoves {
  const { type, theme, reduceMotion } = input;
  const still = motionStill(reduceMotion, theme);
  const art = theme === 'night' ? null : input.art;
  return {
    zs: type === 'sleep' && !still && art?.parts?.zs !== undefined,
    still,
  };
}

/* ------------------------------------------------------------------ where a part is drawn */

/** How the picture is laid on the card: its scale, and where its top-left corner lands. */
export interface ArtPlacement {
  s: number;
  left: number;
  top: number;
}

/**
 * `CardArtLayer`'s own placement (`anchoredCover`: scaled to cover the card, pinned to its right
 * edge, centered up and down), as a scale and an offset — so a "z" placed with it rises through
 * the same air of the picture at every card size and every text size.
 */
export function artPlacement(box: Rect, art: Rect): ArtPlacement {
  const p = anchoredCover(box, art);
  return { s: art.width > 0 ? p.width / art.width : 0, left: p.left, top: p.top };
}

/** A point of the picture, in its pixels, on the card, in points. */
export const onCard = (pl: ArtPlacement, x: number, y: number): { x: number; y: number } => ({
  x: pl.left + x * pl.s,
  y: pl.top + y * pl.s,
});

/* ------------------------------------------------------------------------- loops as frames */

const mod1 = (v: number): number => v - Math.floor(v);

/**
 * A LOOP'S FRAME: `f` over one turn of a clock that runs 0 → 1 and starts again, sampled finely
 * (every 1/`steps` of the turn) plus at every point `f` turns or starts, so the straight lines
 * `interpolate` draws between samples are shorter than a frame is long. The clock is looped on the
 * native driver, which resets it to 0 at each turn; `f(0)` and `f(1)` are the same instant of a
 * loop, so the turn has no seam — `timerMotion.test.ts` holds every frame to that. The Schedule's
 * breathing dot is built on it too (`scheduleMotion.ts`).
 */
export function loopFrame(
  f: (t: number) => number,
  at: readonly number[] = [],
  steps = 120,
): Frame {
  const times = new Set<number>([0, 1]);
  for (let i = 1; i < steps; i += 1) times.add(i / steps);
  for (const t of at) if (t > 0 && t < 1) times.add(t);
  const inputRange = [...times]
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - (all[i - 1] ?? -1) > 1e-6);
  return { inputRange, outputRange: inputRange.map(f), extrapolate: 'clamp' };
}

/* ------------------------------------------------------------------------------ the "z"s */

/**
 * THE "Z"S: one every two and a half seconds, each in the air for six — so two or three are up at
 * once, never more — on a single clock of three spawns, each "z" its own third of it.
 */
export const Z_DRIFT = { cycleMs: 7500, count: 3, life: 0.8 } as const;

/**
 * One "z"'s life, `u` 0 → 1, as turning points (`keyframes.ts`): in quickly and gone slowly;
 * risen the whole way; swaying one way, back past the line and a little again; born at a little
 * over half its size and grown whole; tipping as it goes, the way a drawn "z" floats.
 */
export const Z_LIFE = {
  opacity: [
    [0, 0],
    [0.14, 1],
    [0.5, 1],
    [1, 0],
  ],
  rise: [
    [0, 0],
    [1, 1],
  ],
  sway: [
    [0, 0],
    [0.3, 1],
    [0.66, -0.6],
    [1, 0.3],
  ],
  scale: [
    [0, 0.55],
    [1, 1],
  ],
  turn: [
    [0, -12],
    [0.36, 8],
    [0.72, -5],
    [1, 3],
  ],
} as const satisfies Record<string, readonly Key[]>;

/** Where in its life the `i`th "z" is at clock `t`, or null while it is not in the air. */
export function zLifeAt(i: number, t: number): number | null {
  const born = i / Z_DRIFT.count;
  const u = mod1(t - born) / Z_DRIFT.life;
  return u <= 1 ? u : null;
}

export interface ZFrames {
  /** Where it is born, on the card, in points — its middle — and its size once grown. */
  born: { x: number; y: number };
  size: number;
  opacity: Frame;
  /** How far it has moved from where it was born, in points. */
  x: Frame;
  y: Frame;
  scale: Frame;
  /** Degrees. */
  turn: Frame;
}

/**
 * EVERY "Z", on the card: the path the picture names (`CardArt.parts.zs`, in its pixels), placed
 * with the picture, so the "z"s rise through the same air at every card size. Between one life and
 * the next a "z" is invisible and goes back to where it is born; the jump is drawn at opacity 0.
 */
export function zFrames(pl: ArtPlacement, path: NonNullable<ArtParts['zs']>): ZFrames[] {
  const born = onCard(pl, path.from.x, path.from.y);
  const dx = (path.to.x - path.from.x) * pl.s;
  const dy = (path.to.y - path.from.y) * pl.s;
  const sway = path.sway * pl.s;
  return Array.from({ length: Z_DRIFT.count }, (_, i) => {
    const at = [i / Z_DRIFT.count, mod1(i / Z_DRIFT.count + Z_DRIFT.life)];
    const life = (fn: (u: number) => number, dead: number) =>
      loopFrame(t => {
        const u = zLifeAt(i, t);
        return u === null ? dead : fn(u);
      }, at);
    return {
      born,
      size: path.size * pl.s,
      opacity: life(u => keyValue(Z_LIFE.opacity, u), 0),
      x: life(u => dx * keyValue(Z_LIFE.rise, u) + sway * keyValue(Z_LIFE.sway, u), 0),
      y: life(u => dy * keyValue(Z_LIFE.rise, u), 0),
      scale: life(u => keyValue(Z_LIFE.scale, u), keyValue(Z_LIFE.scale, 0)),
      turn: life(u => keyValue(Z_LIFE.turn, u), keyValue(Z_LIFE.turn, 0)),
    };
  });
}
