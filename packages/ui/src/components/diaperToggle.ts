/**
 * THE DIAPER TOGGLE AS NUMBERS (the owner, 2026-09-26: *"i love the animation update, makes the app
 * look more fun. but i am only seeing it on bottle, we need more of this, like we can do something
 * on diaper category too (wet, dirt, both, and dry)"*). The diaper sheet's "What was in it" as a
 * picture: a pill of the diaper module's soft tint with the four answers written along it, Wet ·
 * Dirty · Both · Dry, and a small diaper — drawn after the owner's own illustrated diaper — standing
 * beside the chosen one. Pure TypeScript, tested in node (`diaperToggle.test.ts`); `DiaperToggle.tsx`
 * only hands these numbers to views and to `Animated.Value#interpolate`.
 *
 * IT IS THE BOTTLE'S AND THE BATH'S LANGUAGE WITH FOUR STOPS (`pictureToggle.ts`): the pill is the
 * picture's ground, the knob is a small object, every answer is written, the chosen one bold in the
 * full ink and the others regular in the quiet one, and each empty stop carries a faint GHOST of the
 * knob in outline, so the pill says "the diaper goes here" without a second color doing the work.
 * What four stops change:
 *
 *   - EACH STOP IS A DIAPER'S SLOT AND ITS WORD, side by side, and the four sit along the pill with
 *     equal room between them. A slot at every stop's own left keeps the picture and the tap in
 *     agreement — the diaper is always inside the chosen answer's own target — and quarters of the
 *     pill would give "Dirty" too little room to grow with the phone's text. So the room is shared
 *     out by the words' own lengths (`diaperToggleGeometry`), the way the segmented control this
 *     replaces sized each pill to its label.
 *   - THE DIAPER HOPS. It is the diaper module's own move (`wakingIcon.ts`: "the diaper hops"): it
 *     crouches, goes from stop to stop in hops, touching down at every stop it passes — Wet to Dry is
 *     three little hops, Wet to Dirty one — and squashes as it lands. The hop is a function of the
 *     knob's PLACE (`pos`, in stops), which is why it touches down exactly at each slot and why a tap
 *     mid-hop turns it round in the air without a jump; the crouch, the lean into the jump and the
 *     landing are the move's own clock (`sway`, the picture track's), set back to rest when it
 *     arrives, where every frame of it draws rest.
 *   - THE WORDS HAVE A VALUE EACH, as the meal sky's have: a diaper hopping from Wet to Dry passes
 *     "Dirty" and "Both", and those going bold on the way would be reading noise. The old word goes
 *     quiet and the new one bold, and nothing between them changes.
 *
 * WHAT THE PICTURE SAYS AT EACH STOP, AT REST — the stripe a real diaper carries down its front,
 * which turns from yellow to blue when it is wet, and a pair of whiff lines:
 *
 *   WET    the stripe blue                      DIRTY  the stripe yellow, two whiff lines over it
 *   BOTH   the stripe blue and the whiff lines  DRY    the stripe yellow and nothing else: clean
 *
 * AND WHAT A CHANGE TO IT PLAYS, ONCE, as the diaper lands (`planDiaperPicture`): to Wet, two
 * droplets fall in from over the pill's edge and the stripe fills blue from the bottom as the first
 * goes in; to Dirty, the whiff lines rise out of it into place and a wisp carries on up, out of the
 * top of the pill, fading; to Both, the droplets and then the whiffs; to Dry, a small sparkle
 * twinkles once over it and is gone. Leaving, the stripe drains back to yellow and the whiffs go as
 * it takes off. Nothing loops, and a pre-selection — a sheet opening on the last diaper's kind —
 * plays none of it: the caller draws that at rest (the bath sheet's `presetKey`). It is a picture of
 * the answer the parent gave and nothing more: there is no stool in it, no color that means anything,
 * no mark for any answer, and it says nothing about the baby (CLAUDE.md §2 rules 1 and 3).
 */
import { isDirty, isWet, type DiaperKind } from '@nibblecue/core';
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';
import { PICTURE_EASE, PICTURE_WORD, pictureFrame } from './pictureToggle';
import type { Span } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the stops */

/** The four answers' places along the pill, left to right: the knob's value is in these. */
export type DiaperStop = 0 | 1 | 2 | 3;
export const DIAPER_STOPS: readonly DiaperStop[] = [0, 1, 2, 3];

type Four<T> = readonly [T, T, T, T];
const four = <T>(f: (s: DiaperStop) => T): Four<T> => [f(0), f(1), f(2), f(3)];

/** Which stop an answer is at: its place among the options, left to right; the first if none. */
export function diaperStopOf(
  options: readonly { value: DiaperKind }[],
  value: DiaperKind,
): DiaperStop {
  const i = options.findIndex(o => o.value === value);
  return (i < 0 ? 0 : Math.min(i, 3)) as DiaperStop;
}

/* ---------------------------------------------------------------------------- the size */

/**
 * THE PILL. 48 tall — eight shorter than the bottle's and the bath's, because the owner asks for
 * things as short as they read well (*"always make things shorter when you can"*) and a diaper is
 * wider than it is tall: its slot is the diaper, centered on the pill's middle, with the room above
 * it that the droplets, the whiffs and the sparkle play in. Every stop's tap target is the pill's
 * full height and at least its slot and its word wide, so every target is over 44 both ways
 * (CLAUDE.md §6). The knob's box sits `inset` inside every edge, and the `rim`, the theme's
 * hairline, is drawn inside that inset.
 *
 * ITS WIDTH IS THE SHEET'S BODY, up to `maxWidth` — 324 pt on a 360 dp Android, 339 on a 375 pt
 * iPhone, 394 on the largest — as the bottle's pill takes it. `minWidth` is not a clamp: it is the
 * narrowest body the placement is PROVEN at (a 344 pt window, narrower than any phone the app
 * supports), and `diaperToggle.test.ts` walks every half point from it.
 */
export const DIAPER_TOGGLE_SIZE = {
  height: 48,
  inset: 4,
  rim: 1,
  minWidth: 308,
  maxWidth: 440,
} as const;

/** The knob's box across: the diaper and a point of air either side. */
export const DIAPER_SLOT = 24;

/**
 * THE ROOM BETWEEN THINGS. `word` is kept between a slot and its own word — `space.sm`, near enough
 * that the diaper reads as that word's — and `unit` is the least kept between a word and the next
 * stop's slot — `space.md`, so a word at its largest never touches the next diaper. Whatever the pill
 * has beyond those is shared equally between the three gaps.
 *
 * `end` is the room at the pill's right-hand end, from its edge to the last word's box. A word may
 * reach into the round end, which is round only at its top and bottom: at the largest a word is
 * drawn, its line still clears the rim there (the test walks its corners against the curve). The
 * left-hand end needs no such number: the first slot starts at the inset, and the diaper in it clears
 * the curve by its own outline, at rest and through every point of a hop.
 */
export const DIAPER_GAP = { word: 6, unit: 8, end: 7 } as const;

/**
 * HOW WIDE A WORD MAY BE: characters × `advance` × the words' size (`PICTURE_WORD.size`, the
 * segmented control's 13). The bottle's and the bath's words are held to 0.6 em a character; these
 * four are short, and the shortest has the widest letter — "Wet" in the Hanken Grotesk Bold the app
 * ships is 1.830 em, 0.610 a character, its capital W doing the work (read out of the TTF; "Dirty"
 * is 0.449, "Both" 0.527, "Dry" 0.545). So they are held to 0.62: a bound, not an average, and one
 * the words really keep in both the weights they are drawn in.
 */
export const DIAPER_WORD = { advance: 0.62 } as const;
export const diaperWordWidth = (label: string, scale = 1): number =>
  [...label].length * DIAPER_WORD.advance * PICTURE_WORD.size * scale;

export interface DiaperToggleGeometry {
  width: number;
  height: number;
  inset: number;
  rim: number;
  /** The knob's box: `slot` wide and `knob` tall. */
  slot: number;
  knob: number;
  /** The knob box's left edge at rest, at each stop. */
  rest: Four<number>;
  /** Where each stop's word is written: after its slot, as wide as the word at `scale`. */
  word: Four<Span>;
  /** Each stop's tap target: its slot and word, and half the room either side, full height. */
  zone: Four<Span>;
  /** How far the words may grow with the phone's text size: the Text's `maxFontSizeMultiplier`. */
  cap: number;
  /** The text size the stops are laid out for: the phone's, never past `cap`. */
  scale: number;
}

/**
 * THE PILL AT `width`, FOR THESE FOUR WORDS, AT THE PHONE'S TEXT SIZE.
 *
 * The words' room is decided first: `cap` is the largest text size at which all four fit their
 * stops with the least gaps kept — the chrome cap at most (1.6, `PICTURE_WORD.ceiling`), and never
 * reported below 1, where a word the bound did not foresee is `adjustsFontSizeToFit`'s to shrink.
 * Then the stops are laid out for the size the words are really drawn at — `fontScale`, up to the
 * cap — and what is left over is shared equally between the gaps, so the diapers stand evenly
 * along the pill at the phone's own text size rather than spaced for one it is not using.
 */
export function diaperToggleGeometry(
  width: number,
  labels: Four<string>,
  fontScale = 1,
): DiaperToggleGeometry {
  const { height, inset, rim, maxWidth } = DIAPER_TOGGLE_SIZE;
  // never narrower than four 44 pt targets beside their slots, whatever a first frame measures
  const w = Math.min(Math.max(width, 4 * (DIAPER_SLOT + DIAPER_GAP.word + 44)), maxWidth);
  const knob = height - 2 * inset;
  const bound = four(s => diaperWordWidth(labels[s]));
  const total = bound.reduce((a, b) => a + b, 0);
  const fixed = 4 * (DIAPER_SLOT + DIAPER_GAP.word) + 3 * DIAPER_GAP.unit;
  const room = w - inset - DIAPER_GAP.end - fixed;
  const fits = room / Math.max(1, total);
  const cap = Math.min(PICTURE_WORD.ceiling, Math.max(1, fits));
  // the size the words are laid out at, and never wider than the pill: a word that does not fit
  // even at 1 is shrunk by its Text, into the room it was given here
  const scale = Math.max(0, Math.min(fontScale, cap, fits));
  const span = four(s => bound[s] * scale);
  const gap = DIAPER_GAP.unit + Math.max(0, room - total * scale) / 3;
  const rest: number[] = [];
  let x = inset;
  for (const s of DIAPER_STOPS) {
    rest.push(x);
    x += DIAPER_SLOT + DIAPER_GAP.word + span[s] + gap;
  }
  const r = four(s => rest[s] ?? inset);
  const word = four(s => {
    const left = r[s] + DIAPER_SLOT + DIAPER_GAP.word;
    return { left, right: left + span[s] };
  });
  // the targets meet half way across each gap, and the two at the ends run out to the pill's ends
  const edge = four(s => (s === 0 ? 0 : (word[(s - 1) as DiaperStop].right + r[s]) / 2));
  const zone = four(s => ({ left: edge[s], right: s === 3 ? w : edge[(s + 1) as DiaperStop] }));
  return { width: w, height, inset, rim, slot: DIAPER_SLOT, knob, rest: r, word, zone, cap, scale };
}

/**
 * THE SAME FOUR STOPS AS TILES (the owner's Option 2 "Soft groups", 2026-10-05): four equal white
 * tiles in a row, the diaper standing in the top of each and its word under it. Only WHERE things
 * stand changes: the knob still hops from `rest` to `rest` on the same frames (`diaperTrackFrames`
 * reads nothing else), the ghosts stand at the other three, and the droplets, the whiffs and the
 * sparkle play at the answer's own stop. `wordTop` is where the words' line starts, under the
 * diaper's foot; `tile` is each tile's width. Nothing is clipped: the tiles are drawn behind, and
 * the hop rises into the room above the diaper that the knob's box already has.
 */
export interface DiaperTileGeometry extends DiaperToggleGeometry {
  tile: number;
  gap: number;
  wordTop: number;
  wordHeight: number;
}

/** The tiles' gap and the words' line, at a text scale of 1. */
export const DIAPER_TILES = { gap: 8, top: 4, wordGap: 2, line: 19, bottom: 8 } as const;

export function diaperTileGeometry(width: number, fontScale = 1): DiaperTileGeometry {
  const { height, inset, rim } = DIAPER_TOGGLE_SIZE;
  const knob = height - 2 * inset;
  const gap = DIAPER_TILES.gap;
  // never narrower than four 44 pt targets
  const w = Math.max(width, 4 * 44 + 3 * gap);
  const tile = (w - 3 * gap) / 4;
  const cap = PICTURE_WORD.ceiling;
  const scale = Math.max(1, Math.min(fontScale, cap));
  const top = DIAPER_TILES.top;
  // the words start just under the diaper's foot, which stands at `DIAPER.foot.y` in the knob box
  const wordTop = top + DIAPER.foot.y + DIAPER_TILES.wordGap;
  const wordHeight = DIAPER_TILES.line * scale;
  const left = four(s => s * (tile + gap));
  const rest = four(s => left[s] + (tile - DIAPER_SLOT) / 2);
  const word = four(s => ({ left: left[s], right: left[s] + tile }));
  return {
    width: w,
    height: wordTop + wordHeight + DIAPER_TILES.bottom,
    inset: top,
    rim,
    slot: DIAPER_SLOT,
    knob,
    rest,
    word,
    zone: word,
    cap,
    scale,
    tile,
    gap,
    wordTop,
    wordHeight,
  };
}

/* ---------------------------------------------------------------------------- the diaper */

/**
 * THE DIAPER, after the owner's illustrated one (`icons/illustrated/diaper.png`, 2026-09-23): a
 * cream body with a wide round seat under a flat waistband, sky-blue tabs at the hips and sky-blue
 * cuffs at the legs, one dark outline — and, where the illustration has a heart, the stripe a real
 * diaper carries down its front, which turns from yellow to blue when it is wet. Drawn in the
 * knob's box (`DIAPER_SLOT` × 40, y down), 22 × 16, centered on the pill's middle.
 */
export const DIAPER = {
  body: 'M1 13.8Q1 12 2.8 12H21.2Q23 12 23 13.8V18.4C23 24.2 18.3 28 12 28C5.7 28 1 24.2 1 18.4Z',
  /** The two tabs at the hips. */
  tabs: [
    'M1 15.4H3.8Q4.8 15.4 4.8 16.4V17.4Q4.8 18.4 3.8 18.4H1Z',
    'M23 15.4H20.2Q19.2 15.4 19.2 16.4V17.4Q19.2 18.4 20.2 18.4H23Z',
  ],
  /** The two cuffs at the legs: a crescent inside each lower side of the seat. */
  cuffs: [
    'M1.3 19.8C2 23.4 4.3 26.1 7.5 27.2C6.8 24.3 4.6 21.2 1.3 19.8Z',
    'M22.7 19.8C22 23.4 19.7 26.1 16.5 27.2C17.2 24.3 19.4 21.2 22.7 19.8Z',
  ],
  /**
   * The legs' openings: each cuff's inner edge, drawn in the outline's ink — what makes the shape
   * a diaper and not a bowl, in the knob and in its ghost.
   */
  legs: ['M1.3 19.8C4.6 21.2 6.8 24.3 7.5 27.2', 'M22.7 19.8C19.4 21.2 17.2 24.3 16.5 27.2'],
  /** The wetness indicator down the front: yellow while dry, blue once wet. */
  stripe: { x: 11.05, y: 16.4, width: 1.9, height: 8.4 },
  /** The outline's width, round the body; the tabs and the legs take `detail`. */
  stroke: 1.3,
  detail: 0.9,
  /** Its extent in the box, for the placement test. */
  bounds: { left: 1, right: 23, top: 12, bottom: 28 },
  /** Its middle, and its foot — where it crouches, leans and lands. */
  center: { x: 12, y: 20 },
  foot: { x: 12, y: 28 },
} as const;

/** The diaper at the stops it is not at: in outline, a little smaller, standing where it would. */
export const DIAPER_GHOST_SCALE = 0.78;

/* ------------------------------------------------------------------------ the marks on it */

/** The whiff's stroke, with round ends. */
export const WHIFF_STROKE = 1.3;
/** One whiff line in its own box, `WHIFF_BOX` wide and as tall as the whiff. */
export const WHIFF_BOX = 6;
/** How far the wave swings either side of its middle: its control points', not the curve's. */
export const WHIFF_SWING = 1.9;
/**
 * A whiff as a path in its box `h` tall: a wave of two swings, from its foot up to its tip — drawn
 * half a stroke in from each end, because a round cap reaches that far past the line's end, and a cap
 * outside its box would be cut flat.
 */
export const whiffPath = (h: number): string => {
  const c = WHIFF_BOX / 2;
  const a = WHIFF_SWING;
  const pad = WHIFF_STROKE / 2;
  const y = (quarters: number) => Number((h - pad - ((h - 2 * pad) * quarters) / 4).toFixed(3));
  return (
    `M${c} ${y(0)}C${c - a} ${y(0.5)} ${c + a} ${y(1.5)} ${c} ${y(2)}` +
    `C${c - a} ${y(2.5)} ${c + a} ${y(3.5)} ${c} ${y(4)}`
  );
};

/**
 * THE WHIFF LINES over a dirty diaper, at rest: two waves rising from over its waistband and
 * leaning apart — a smell drifts out, steam goes straight up — in the knob's box. `x` is each one's
 * middle, `top` and `bottom` its ends, `tilt` its lean in degrees about its foot.
 */
export const WHIFFS: readonly { x: number; top: number; bottom: number; tilt: number }[] = [
  { x: 8, top: 2.6, bottom: 10.6, tilt: -12 },
  { x: 16, top: 2.6, bottom: 10.6, tilt: 12 },
];

/**
 * THE WISP that rises past the whiffs on the way in to Dirty and Both and fades out of the pill's
 * top: one more whiff, between the two, from the waistband up by `rise`.
 */
export const WISP = { x: 12, top: 3.6, bottom: 11.6, rise: 20 } as const;

/**
 * THE DROPLETS that fall in on the way to Wet and Both: two teardrops, a little apart, falling from
 * over the pill's top edge — `from`, above the knob's box — to the waistband, where they go in; the
 * second a beat after the first (`at`, in the droplets' clock).
 */
export const DROP = { width: 4, height: 5.4 } as const;
export const DROP_PATH =
  'M2 0C2.6 1.2 4 2.6 4 3.4C4 4.5 3.1 5.4 2 5.4C0.9 5.4 0 4.5 0 3.4C0 2.6 1.4 1.2 2 0Z';
export const DROPS: readonly { x: number; from: number; at: number }[] = [
  { x: 8.8, from: -7, at: 0 },
  { x: 15.2, from: -9, at: 0.33 },
];
/** How much of the droplets' clock each one takes, from appearing to gone in. */
export const DROP_SPAN = 0.55;

/**
 * THE SPARKLE that twinkles once on the way in to Dry, and a smaller one a beat after: the day sky's
 * own sparkle (`SPARKLE_PATH`, the illustration's shape too), over the diaper's shoulders, inside
 * its slot. `x`, `y` are each one's middle in the knob's box.
 */
export const SPARKLES: readonly { x: number; y: number; size: number; at: number }[] = [
  { x: 19, y: 6.4, size: 8, at: 0 },
  { x: 4.6, y: 8.4, size: 4.6, at: 0.22 },
];

/* ------------------------------------------------------------------------ when it moves */

/**
 * ONE MOVE, END TO END: about half a second for one hop, and a little over three quarters for three
 * — each hop quicker the more there are, hop-hop-hop — never longer than `most` stops' worth.
 */
export const DIAPER_MS = { base: 380, perStop: 130, most: 3 } as const;
export const diaperMoveMs = (distance: number): number =>
  Math.round(DIAPER_MS.base + DIAPER_MS.perStop * Math.min(Math.max(distance, 0), DIAPER_MS.most));

/**
 * THE CROUCH AND THE LANDING, as shares of the move: for the first `hold` of it the diaper stays
 * where it is and crouches, and for the last it stays where it landed and squashes. Between them it
 * flies at one speed — a thrown thing crosses the ground at one speed, and the hop's arc is the
 * ease — so several hops keep one beat rather than hurrying through the middle ones.
 */
export const DIAPER_HOLD = 0.1;
/** Where the diaper touches down at its stop, as a share of the move. */
export const DIAPER_LANDS = 1 - DIAPER_HOLD;

/** The knob's place along its move at `x`, the share of its time gone: held, flown, held. */
export const diaperEase = (x: number): number =>
  Math.min(1, Math.max(0, (x - DIAPER_HOLD) / (1 - 2 * DIAPER_HOLD)));

/** The words' curve: the picture track's, a soft start and a long, soft arrival. */
export const DIAPER_WORD_EASE = PICTURE_EASE;
/**
 * Of a word's own value (1 chosen, 0 not): its quiet ink, the other half of the cross-fade, so the
 * two inks of a word always add up to one and the word is never less than whole.
 */
export const WORD_QUIET = pictureFrame([0, 1], [1, 0]);

/** A move in flight: where the knob set off from (in stops), where to, when, and for how long. */
export interface DiaperMotion {
  from: number;
  to: DiaperStop;
  startedAt: number;
  duration: number;
}

/** Where the knob is, in stops, `now` — an estimate; the native driver has the truth. */
export function diaperKnobAt(m: DiaperMotion, now: number): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (m.to - m.from) * diaperEase(x);
}

export interface DiaperPlan {
  animate: boolean;
  /** Where the knob is as the move begins — the next re-target's starting point. */
  from: number;
  to: DiaperStop;
  duration: number;
  /** Where `sway` runs to: +1 for a move to the right, −1 to the left, 0 when nothing moves. */
  sway: -1 | 0 | 1;
}

/**
 * WHAT A CHANGE OF STOP DOES TO THE KNOB. From rest, it sets off from its stop; mid-move, it turns
 * round from where the clock says it is, so a second tap never makes it jump. Still — reduce
 * motion, the amber Night (`pictureStill`) — nothing animates: `pos` is set to the stop.
 */
export function planDiaperMove(
  motion: DiaperMotion | null,
  at: DiaperStop,
  to: DiaperStop,
  now: number,
  still: boolean,
): DiaperPlan {
  if (still) return { animate: false, from: to, to, duration: 0, sway: 0 };
  const moving = motion !== null && now < motion.startedAt + motion.duration;
  const from = moving ? diaperKnobAt(motion, now) : at;
  const distance = Math.abs(to - from);
  return {
    animate: distance > 1e-6,
    from,
    to,
    duration: diaperMoveMs(distance),
    sway: to > from ? 1 : to < from ? -1 : 0,
  };
}

/* ------------------------------------------------------------------- what the picture does */

/** What a kind looks like at rest: whether its stripe is blue, whether whiffs stand over it. */
export interface DiaperLook {
  wet: boolean;
  dirty: boolean;
}
/** Core's own reading of the kinds: DIRTY and BOTH hold a bowel movement, WET and BOTH are wet. */
export const diaperLook = (kind: DiaperKind): DiaperLook => ({
  wet: isWet(kind),
  dirty: isDirty(kind),
});

/** How long each part of the picture takes, and how it is placed against the landing. */
export const DIAPER_PICTURE_MS = {
  /** The droplets' clock: both of them, from the first appearing to the second gone in. */
  drops: 620,
  /** How long before the diaper touches down the first droplet appears over the pill's edge. */
  dropLead: 150,
  /** The stripe filling blue from the bottom, from the moment the first droplet goes in. */
  fill: 300,
  /** The whiffs rising out of the diaper into their place. */
  whiffs: 520,
  /** On Both, how long after the first droplet goes in the whiffs start. */
  whiffAfterDrop: 100,
  /** The wisp rising out of the pill, a beat after the whiffs start. */
  wisp: 820,
  wispAfterWhiffs: 100,
  /** The sparkle, from nothing to nothing, starting just as the diaper lands. */
  twinkle: 640,
  twinkleLead: 40,
  /** The whiffs going as the diaper takes off. */
  leave: 200,
  /** The stripe draining back to yellow: over the first part of the flight. */
  drain: 0.4,
} as const;

/** One value's part in a change: where it goes, after how long, over how long. */
export interface DiaperRun {
  to: 0 | 1;
  delay: number;
  duration: number;
}

export interface DiaperPicturePlan {
  animate: boolean;
  /**
   * The stripe (0 yellow, 1 blue) and the whiffs at rest (0 none, 1 standing): the state, run to the
   * answer's own look on every change — null only when nothing animates.
   */
  wet: DiaperRun | null;
  dirty: DiaperRun | null;
  /**
   * The droplets', the wisp's and the sparkle's clocks, each wound back to 0 and run once after
   * this many ms — or null, and set to its end, where it draws nothing.
   */
  drops: number | null;
  wisp: number | null;
  twinkle: number | null;
  /** The end state, which is what a still picture is set to. */
  end: { wet: 0 | 1; dirty: 0 | 1 };
}

/**
 * WHAT A CHANGE OF ANSWER DOES TO THE PICTURE. The parent's tap plays the picture of the answer
 * they chose, once, as the diaper lands there (`DIAPER_LANDS` of the move): the droplets for a wet
 * answer, the stripe filling as the first goes in; the whiffs rising for a dirty one, and the wisp
 * after them — after the droplets, for Both; the sparkle for Dry. Leaving a wet answer drains the
 * stripe and leaving a dirty one takes the whiffs, as the diaper takes off.
 *
 * THE STRIPE AND THE WHIFFS ARE RUN TO THE ANSWER'S LOOK ON EVERY CHANGE, from wherever they are —
 * never only when the look changes. A run to where a value already is moves nothing (Wet to Both:
 * the stripe is already blue, and stays), and a tap that came before the last change had finished
 * would otherwise leave it unfinished: Dry, then Wet, then Both before the first droplet went in
 * would stop the stripe's fill with the Wet move and never start it again, and Both would rest on a
 * yellow stripe. The droplets still fall and the wisp still rises between two answers that share
 * them, because they are the picture of the answer chosen.
 *
 * `changed` false — the first render, or one that moved nothing — plays nothing. STILL (reduce
 * motion, the amber Night) plays nothing either: the end state is set, the stripe blue or not and
 * the whiffs there or not, and every event's clock is at its end, where it draws nothing.
 */
export function planDiaperPicture(
  is: DiaperKind,
  changed: boolean,
  moveMs: number,
  still: boolean,
): DiaperPicturePlan {
  const look = diaperLook(is);
  const end = { wet: look.wet ? 1 : 0, dirty: look.dirty ? 1 : 0 } as const;
  if (still || !changed)
    return { animate: false, wet: null, dirty: null, drops: null, wisp: null, twinkle: null, end };
  const ms = DIAPER_PICTURE_MS;
  const land = Math.round(moveMs * DIAPER_LANDS);
  const takeoff = Math.round(moveMs * DIAPER_HOLD);
  const drops = look.wet ? Math.max(0, land - ms.dropLead) : null;
  // the moment the first droplet goes in at the waistband
  const firstIn = drops === null ? null : drops + Math.round(ms.drops * DROP_SPAN);
  const whiffs = firstIn === null ? land : firstIn + ms.whiffAfterDrop;
  const wet: DiaperRun = look.wet
    ? { to: 1, delay: firstIn ?? land, duration: ms.fill }
    : { to: 0, delay: takeoff, duration: Math.round(moveMs * ms.drain) };
  const dirty: DiaperRun = look.dirty
    ? { to: 1, delay: whiffs, duration: ms.whiffs }
    : { to: 0, delay: 0, duration: ms.leave };
  return {
    animate: true,
    wet,
    dirty,
    drops,
    wisp: look.dirty ? whiffs + ms.wispAfterWhiffs : null,
    twinkle: !look.wet && !look.dirty ? Math.max(0, land - ms.twinkleLead) : null,
    end,
  };
}

/* ------------------------------------------------------------------------- the frames */

/** How finely a hop is sampled between two stops: the arc is a parabola, drawn in eight pieces. */
const HOP_PIECES = 8;
/** How high a hop goes, in points: the diaper's top stays inside the pill at the top of it. */
export const HOP = 7;
/** How far past the overlap, in stops, a ghost takes to go out or come back in. */
const GHOST_FADE = 0.16;

export interface DiaperTrackFrames {
  /** Of `pos`: the knob's travel from the first stop's slot, straight between two stops'. */
  knobX: Frame;
  /** Of `pos`: the hop — a parabola between every two stops, down at each one. */
  hopY: Frame;
  /** Of `pos`: each stop's ghost — gone while the knob is over its slot, back once it has left. */
  ghost: Four<Frame>;
}

export function diaperTrackFrames(g: DiaperToggleGeometry): DiaperTrackFrames {
  const hopIn: number[] = [];
  const hopOut: number[] = [];
  for (let k = 0; k < 3; k += 1)
    for (let i = k === 0 ? 0 : 1; i <= HOP_PIECES; i += 1) {
      const f = i / HOP_PIECES;
      hopIn.push(k + f);
      // exactly 0 at each stop, not a floating-point hair above it
      hopOut.push(i === 0 || i === HOP_PIECES ? 0 : -HOP * 4 * f * (1 - f));
    }
  const ghost = four(k => {
    // how far towards a neighbor, in stops, the knob's box starts to cover this slot
    const over = (n: number): number => g.slot / Math.max(g.slot, Math.abs(g.rest[k] - n));
    const pts: (readonly [number, number])[] = [];
    if (k > 0) {
      const o = over(g.rest[(k - 1) as DiaperStop]);
      pts.push([k - o - GHOST_FADE, 1], [k - o, 0]);
    } else pts.push([0, 0]);
    if (k < 3) {
      const o = over(g.rest[(k + 1) as DiaperStop]);
      pts.push([k + o, 0], [k + o + GHOST_FADE, 1]);
    } else pts.push([3, 0]);
    return pictureFrame(
      pts.map(p => p[0]),
      pts.map(p => p[1]),
    );
  });
  return {
    knobX: pictureFrame(
      DIAPER_STOPS,
      DIAPER_STOPS.map(s => g.rest[s] - g.rest[0]),
    ),
    hopY: pictureFrame(hopIn, hopOut),
    ghost,
  };
}

/**
 * A frame of `sway` from its right-hand half — `keys` from 0 to 1, eased between its turning points
 * (`keyFrame`) — mirrored to −1: `sign` 1 for an even frame, f(−s) = f(s), and −1 for an odd one,
 * f(−s) = −f(s). The two halves share their point at 0.
 */
function mirroredSway(keys: readonly Key[], sign: 1 | -1): Frame {
  const right = keyFrame(keys);
  const xs = right.inputRange;
  const ys = right.outputRange;
  // `0 - x`, `+ 0`: a −0 would be one more point `interpolate` reads as a duplicate of 0
  const left = xs.map((x, i) => [0 - x, sign * (ys[i] ?? 0) + 0] as const).reverse();
  const both = [...left.slice(0, -1), ...xs.map((x, i) => [x, ys[i] ?? 0] as const)];
  return pictureFrame(
    both.map(p => p[0]),
    both.map(p => p[1]),
  );
}

/**
 * A MOVE'S BODY LANGUAGE, as frames of `sway` (0 at rest, run to +1 through a move to the right and
 * to −1 through one to the left, then set back to 0, which every frame here draws as rest), all
 * three about the diaper's foot:
 *
 *   `lean`     odd: into the jump as it takes off, back as it comes down, upright at the end
 *   `squashY`  even: a crouch while it holds before it goes, a stretch in the air, a squash as it
 *              lands, and up again
 *   `squashX`  even: the same the other way, so it keeps its size
 */
export interface DiaperBodyFrames {
  lean: Frame;
  squashY: Frame;
  squashX: Frame;
}

/** How far the diaper leans into a jump, in degrees. */
export const DIAPER_LEAN = 7;

export function diaperBodyFrames(): DiaperBodyFrames {
  const a = DIAPER_LEAN;
  const h = DIAPER_HOLD;
  return {
    lean: mirroredSway(
      [
        [0, 0],
        [h + 0.04, a],
        [0.6, a * 0.4],
        [DIAPER_LANDS - 0.04, -a * 0.45],
        [1, 0],
      ],
      -1,
    ),
    squashY: mirroredSway(
      [
        [0, 1],
        [h * 0.7, 0.88],
        [h + 0.1, 1.06],
        [DIAPER_LANDS - 0.1, 1.03],
        [DIAPER_LANDS + 0.03, 0.86],
        [1, 1],
      ],
      1,
    ),
    squashX: mirroredSway(
      [
        [0, 1],
        [h * 0.7, 1.1],
        [h + 0.1, 0.96],
        [DIAPER_LANDS - 0.1, 0.98],
        [DIAPER_LANDS + 0.03, 1.12],
        [1, 1],
      ],
      1,
    ),
  };
}

/**
 * THE PICTURE'S FRAMES — each of its own value:
 *
 *   `stripe`   of `wet`: the blue's place in the stripe, from under it (0) to over it (1), so it
 *              fills from the bottom as a real indicator does, and drains back the same way
 *   `whiffs`   of `dirty`: each whiff rising out of the waistband into its place, swaying as it
 *              comes and fading in, the second a beat after the first
 *   `drops`    of the droplets' clock: each one falling, faster as it goes, and going in at the
 *              waistband — nothing before its turn and nothing after, so the clock's rest draws none
 *   `wisp`     of the wisp's clock: up from the waistband and out of the top of the pill, swaying,
 *              fading as it goes — none at rest
 *   `sparkles` of the sparkle's clock: each growing out of nothing, a twinkle, and gone — none at
 *              rest
 */
export interface DiaperPictureFrames {
  stripe: Frame;
  whiffs: readonly { y: Frame; x: Frame; opacity: Frame }[];
  drops: readonly { y: Frame; opacity: Frame; scale: Frame }[];
  wisp: { y: Frame; x: Frame; opacity: Frame };
  sparkles: readonly { scale: Frame; opacity: Frame; rotate: Frame }[];
}

/** How far a whiff rises into place, in points, from inside the waistband. */
export const WHIFF_RISE = 6;

export function diaperPictureFrames(): DiaperPictureFrames {
  // the waistband's top, where the droplets go in, in the knob's box
  const band = DIAPER.bounds.top;
  return {
    stripe: pictureFrame([0, 1], [DIAPER.stripe.height, 0]),
    whiffs: WHIFFS.map((_, i) => {
      const t = (u: number) => i * 0.22 + u * 0.78;
      return {
        y: keyFrame([
          [t(0), WHIFF_RISE],
          [t(1), 0],
        ]),
        x: keyFrame([
          [t(0), 0],
          [t(0.35), 1.1],
          [t(0.7), -0.7],
          [t(1), 0],
        ]),
        opacity: pictureFrame([t(0), t(0.4)], [0, 1]),
      };
    }),
    drops: DROPS.map(d => {
      const fall = band - DROP.height - d.from;
      const t = (u: number) => d.at + u * DROP_SPAN;
      return {
        // falling: a quarter of the way down at half its time, as a dropped thing goes (u²)
        y: pictureFrame(
          [t(0), t(0.25), t(0.5), t(0.75), t(1)],
          [0, 0.0625 * fall, 0.25 * fall, 0.5625 * fall, fall],
        ),
        opacity: pictureFrame([t(0), t(0.1), t(0.86), t(1)], [0, 1, 1, 0]),
        scale: pictureFrame([t(0), t(0.84), t(1)], [1, 1, 0.55]),
      };
    }),
    wisp: {
      y: keyFrame([
        [0, 0],
        [1, -WISP.rise],
      ]),
      x: keyFrame([
        [0, 0],
        [0.3, -1.4],
        [0.6, 1.2],
        [1, -0.6],
      ]),
      opacity: pictureFrame([0, 0.12, 0.55, 1], [0, 1, 0.85, 0]),
    },
    sparkles: SPARKLES.map(sp => {
      const t = (u: number) => sp.at + u * (1 - sp.at);
      return {
        scale: keyFrame([
          [t(0), 0],
          [t(0.3), 1.15],
          [t(0.5), 0.78],
          [t(0.7), 1],
          [t(1), 0],
        ]),
        opacity: pictureFrame([t(0), t(0.12), t(0.8), t(1)], [0, 1, 1, 0]),
        rotate: pictureFrame([t(0), t(1)], [0, 45]),
      };
    }),
  };
}
