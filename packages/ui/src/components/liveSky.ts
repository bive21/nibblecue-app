/**
 * Today's sky as numbers: which sky an hour has, when it looks again, how one sky gives way to the
 * next, and where the stars sit so none of them is ever under a control (the owner, 2026-09-25:
 * *"might not necessarily be useful, but it's cool … Let's try doing everything"*). Pure
 * TypeScript, so it is tested in node; `LiveSky.tsx` only draws what these return, and the app's
 * `useSkyPhase` only asks `skyPhaseIn` once a minute while Today is in front.
 *
 * FOUR PHASES ON FIXED HOURS, AND THAT IS A CHOICE, NOT AN OVERSIGHT. The real sunrise moves by
 * three hours over a year and more across latitudes, and the app knows the household's time zone
 * but not where in it they live — so a sunrise it computed would be precise and wrong. The hours
 * below are the middle of the year at the middle latitudes: dawn from five, day from eight, dusk
 * from six in the evening, night from nine. Moving one is a number here and nothing else, and if
 * the owner would rather the sky followed the real sun, the phone's location is the question to
 * ask first (CLAUDE.md §6: the cheapest reversible choice, written down).
 *
 * THE SKY CHANGES FOUR TIMES A DAY AND SITS STILL IN BETWEEN. Nothing drifts and nothing twinkles:
 * when the hour crosses a phase, the new sky fades in over the old one for three seconds, and that
 * is the only motion it has. Under reduce motion, and in the amber Night theme, it does not fade
 * at all — the new sky is simply there (`skyMove`).
 */
import { wallClock } from '@nibblecue/core';
import type { SkyPhase } from '../theme/liveSky';
import { space } from '../theme/theme';
import {
  chipMaxWidth,
  markSize,
  TOP_BAR_AVATAR,
  TOP_BAR_GAP,
  TOP_BAR_GUTTER,
} from './topBarLayout';

export type { SkyPhase } from '../theme/liveSky';

/* ------------------------------------------------------------------------ the hours */

const MINUTES_PER_DAY = 24 * 60;

/** Where each phase begins, in minutes after midnight, in the order the day meets them. */
export const SKY_PHASE_STARTS: readonly { phase: SkyPhase; from: number }[] = [
  { phase: 'dawn', from: 5 * 60 },
  { phase: 'day', from: 8 * 60 },
  { phase: 'dusk', from: 18 * 60 },
  { phase: 'night', from: 21 * 60 },
];

/**
 * The sky at a minute of the day. Any number is folded into one day first, so a minute counted
 * past midnight, or before it, is still a time on the clock.
 */
export function skyPhaseAt(minuteOfDay: number): SkyPhase {
  const m = Number.isFinite(minuteOfDay)
    ? ((Math.floor(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    : 0;
  let phase: SkyPhase = 'night';
  for (const start of SKY_PHASE_STARTS) if (m >= start.from) phase = start.phase;
  return phase;
}

/**
 * The sky at an instant, read on the clock of `timeZone` — the zone Today's own times are read in
 * (`useTimeZone`: the phone's, or home's while a trip keeps home time). A zone the engine does not
 * know falls back to the phone's own clock rather than throwing: a sky is never worth an error.
 */
export function skyPhaseIn(timeZone: string, atMs: number): SkyPhase {
  try {
    const wall = wallClock(timeZone, atMs);
    return skyPhaseAt(wall.hour * 60 + wall.minute);
  } catch {
    const local = new Date(atMs);
    return skyPhaseAt(local.getHours() * 60 + local.getMinutes());
  }
}

/**
 * How often the app looks at the clock while Today is in front: once a minute. The sky changes at
 * most four times a day, so this only decides how late a change can be, and a minute is a sky
 * that turns within a minute of the hour it was due.
 */
export const SKY_CHECK_MS = 60_000;

/* ------------------------------------------------------------------------ the change */

/** One sky giving way to the next: slow enough to be a sky changing, not a screen blinking. */
export const SKY_FADE_MS = 3000;

/**
 * What a change of phase does. Under reduce motion nothing is animated (docs/DESIGN_SYSTEM.md §7,
 * "disables transforms and transitions but never hides content"), and in the amber Night theme
 * nothing moves at all — there the sky is one flat color for every phase, so a fade would be three
 * seconds of animating a color onto itself. The end state is the same either way.
 */
export function skyMove(opts: { reduceMotion: boolean; night: boolean }): {
  animate: boolean;
  duration: number;
} {
  const still = opts.reduceMotion || opts.night;
  return { animate: !still, duration: still ? 0 : SKY_FADE_MS };
}

/* ------------------------------------------------------------------------ the picture */

/**
 * How far up the bar the sky fades out into the page, in points. The band is exactly the top
 * bar's box (Screen.tsx `barBackdrop`), so the fade lives inside it: the sky never reaches the
 * page's own words, which is why nothing below the bar had to be measured against it — a section
 * header's accent action is 4.7:1 on the paper and would not be on a sky.
 */
/**
 * 40, AND EASED OUT, since 2026-10-06 (the owner: "there is a clear separation line between the
 * bottom of the header and the actual page. Soften this to make it look like one"): at 20 the sky
 * ended in a visible band; over 40, its opacity easing out (`LiveSky`), it melts into the page.
 */
export const SKY_FOOT = 40;
/** Where the stars stop, above the bar's foot: the fade's old depth, where the sky is still whole. */
export const STAR_FOOT = 20;

/**
 * THE BAR'S CONTROLS, AS THE STARS HAVE TO KNOW THEM. The row the child chip, the mark, the bell
 * and the avatar share sits `space.md` above the bottom of the bar and is as tall as the chip
 * (topBarLayout.ts: a 31 avatar and `space.xs` above and below it). The bell is the design
 * system's chrome IconButton, 34 across.
 */
const ROW_BOTTOM = space.md;
const ROW_HEIGHT = TOP_BAR_AVATAR + 2 * space.xs;
/** IconButton's chrome size (IconButton.tsx, `size = 34`); `liveSky.test.ts` reads it back. */
export const BELL_SIZE = 34;
/** The clear air a star keeps from any control, and from the band's own edges. */
export const STAR_CLEARANCE = space.md;

export interface SkyStar {
  /** Its center, in the band's own coordinates. */
  x: number;
  y: number;
  size: number;
  kind: 'dot' | 'sparkle';
}

/** A stretch of the bar with no control in it, left to right. */
export interface SkyGap {
  left: number;
  right: number;
}

/**
 * THE STARS, AS A PLACE IN A GAP RATHER THAN A PLACE ON THE SCREEN. Each is a fraction of the gap
 * it belongs to across, and of the stars' band down, so the same few land in the same kind of
 * place on every phone: two sparkles and two dots between the mark and the bell, and one small dot
 * between the child chip's widest and the mark, where there is room for one.
 */
const STAR_PLAN: readonly {
  gap: 'left' | 'right';
  fx: number;
  fy: number;
  size: number;
  kind: SkyStar['kind'];
}[] = [
  { gap: 'right', fx: 0.2, fy: 0.3, size: 7, kind: 'sparkle' },
  { gap: 'right', fx: 0.42, fy: 0.85, size: 2, kind: 'dot' },
  { gap: 'right', fx: 0.66, fy: 0.15, size: 5, kind: 'sparkle' },
  { gap: 'right', fx: 0.88, fy: 0.7, size: 2.5, kind: 'dot' },
  { gap: 'left', fx: 0.5, fy: 0.5, size: 2, kind: 'dot' },
];

export interface LiveSkyGeometry {
  width: number;
  height: number;
  /** Where the fade into the page begins, as a gradient offset (0 at the top, 1 at the foot). */
  fadeFrom: number;
  /** The two gaps between the bar's controls, where nothing a parent reads or taps can be. */
  gaps: { left: SkyGap | null; right: SkyGap };
  /** The band the stars keep to, top to bottom: inside the controls' row and above the fade. */
  band: { top: number; bottom: number };
  stars: readonly SkyStar[];
}

/**
 * The sky at the size the bar laid out at. `height` is the bar's own — the status-bar inset, the
 * row, the padding — and grows with the chip when the phone's text is large; every star is placed
 * from the bottom up, so it stays in the row whatever sits above it.
 *
 * The gaps are taken against the controls at their WIDEST: the chip at its cap (a short name
 * leaves more room than this counts, never less), the mark at its size, and the bell with the
 * avatar at the right edge. A sync chip, when there is one, sits in the right-hand gap on an opaque
 * fill of its own and hides the stars behind it, which is all a star should ever do there.
 */
export function liveSkyGeometry(width: number, height: number): LiveSkyGeometry {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const mark = markSize(w);
  const leftGap: SkyGap = {
    left: TOP_BAR_GUTTER + chipMaxWidth(w) + STAR_CLEARANCE,
    right: w / 2 - mark / 2 - STAR_CLEARANCE,
  };
  const rightGap: SkyGap = {
    left: w / 2 + mark / 2 + STAR_CLEARANCE,
    right: w - TOP_BAR_GUTTER - TOP_BAR_AVATAR - TOP_BAR_GAP - BELL_SIZE - STAR_CLEARANCE,
  };
  const rowTop = h - ROW_BOTTOM - ROW_HEIGHT;
  // the stars keep the band they had when the fade was 20 deep: they sit over the full sky
  const band = { top: rowTop + space.xs, bottom: h - STAR_FOOT - space.xs };
  const stars: SkyStar[] = [];
  for (const s of STAR_PLAN) {
    const gap = s.gap === 'left' ? leftGap : rightGap;
    const x = gap.left + (gap.right - gap.left) * s.fx;
    const y = band.top + (band.bottom - band.top) * s.fy;
    // a star that would not fit its gap or its band whole is left out, never squeezed in: on the
    // narrowest phones the chip's cap and the mark leave no left gap at all
    const r = s.size / 2;
    if (x - r < gap.left || x + r > gap.right) continue;
    if (y - r < band.top || y + r > band.bottom) continue;
    stars.push({ x, y, size: s.size, kind: s.kind });
  }
  return {
    width: w,
    height: h,
    fadeFrom: h <= 0 ? 0 : Math.max(0, (h - SKY_FOOT) / h),
    gaps: { left: leftGap.right > leftGap.left ? leftGap : null, right: rightGap },
    band,
    stars,
  };
}
