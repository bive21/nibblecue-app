/**
 * TWINS "BOTH" (the owner, 2026-09-25, of the "that's cool" list; idea #8): the child chip's one
 * avatar splits into the babies' own discs when the bar switches to Both, and they merge back when
 * it switches to one baby. Two halves, the way this package tests anything that moves: the picture
 * at every point of its one animated value is PURE (`childPair.ts`) and is sampled here exactly as
 * `Animated.Value#interpolate` would sample it; what can only be seen on a device — that the chip is
 * still one button with the same name, runs on the native driver and honors reduce motion and the
 * amber night — is held by tripwires over `ChildChip.tsx`, because this suite has no renderer
 * (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { space, themeNames } from '../theme/theme';
import {
  PAIR_AFTER_SHEET_MS,
  PAIR_BOX,
  PAIR_EASE,
  PAIR_MAX,
  PAIR_MS,
  pairFrames,
  pairGeometry,
  pairMove,
  pairShown,
  type PairGeometry,
} from './childPair';
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';
import { chipMaxWidth, TOP_BAR_AVATAR } from './topBarLayout';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const chip = withoutComments(read('ChildChip.tsx'));
const flat = chip.replace(/\s+/g, ' ');
const pure = withoutComments(read('childPair.ts'));

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped or extended past the ends. */
function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  const seg = (i: number) => {
    const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
    return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  };
  if (p <= (xs[0] ?? 0)) return fr.extrapolate === 'clamp' ? (ys[0] ?? 0) : seg(0);
  if (p >= (xs[last] ?? 1)) return fr.extrapolate === 'clamp' ? (ys[last] ?? 0) : seg(last - 1);
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  return seg(i);
}

/** The highest point a cubic Bézier easing reaches — how far past its target it carries a value. */
function peakOf(curve: readonly [number, number, number, number]): number {
  let peak = 0;
  for (let i = 0; i <= 4000; i += 1) peak = Math.max(peak, easeAt(curve, i / 4000));
  return peak;
}
const PEAK = peakOf(PAIR_EASE);

/**
 * The values `split` passes through on a split (0 → 1) and a merge (1 → 0), on the real curve —
 * a hundred along it, and its exact furthest carry each way, which is where a disc is furthest out.
 * The discs move on straight lines, so those extremes are the whole of the question.
 */
const TRIP: readonly number[] = Array.from({ length: 101 }, (_, i) => easeAt(PAIR_EASE, i / 100));
const ALL_SPLITS = [...TRIP, ...TRIP.map(v => 1 - v), PEAK, 1 - PEAK];

const TWO = pairGeometry(2);
const THREE = pairGeometry(3);
const BOTH = [TWO, THREE] as const;
/** Each geometry's frames, built once: the walks below sample them tens of thousands of times. */
const FRAMES = new Map(BOTH.map(g => [g, pairFrames(g)] as const));

/**
 * THE CHIP, as a place for the discs: the avatar's square sits `space.xs` in from the chip's left
 * and is centered in its height, which is 39 at the least and grows with the phone's text size; the
 * chip is a pill, so its left end is a half circle of half its height; and the words begin a
 * `space.md` gap after the square.
 */
const CHIP = { pad: space.xs, words: space.xs + TOP_BAR_AVATAR + space.md, minHeight: 39 } as const;

/** How far a circle at (x, y) in the SQUARE's coordinates is inside the pill of height `h`. */
function insideBy(x: number, y: number, r: number, h: number): number {
  const cx = CHIP.pad + x;
  const cy = (h - TOP_BAR_AVATAR) / 2 + y;
  const rr = h / 2;
  // the nearest point of the pill's center line: the left cap's center, or straight up and down
  const nx = Math.max(cx, rr);
  return rr - (Math.hypot(cx - nx, cy - rr) + r);
}

/** A disc's outer radius: the ring round it included, for every disc drawn over another. */
const outerOf = (g: PairGeometry, i: number) => g.disc / 2 + (i > 0 ? g.ring : 0);

/** A disc's center at a value of `split`, through the frames the component hands to Animated. */
function centerAt(g: PairGeometry, i: number, split: number) {
  const f = (FRAMES.get(g) ?? pairFrames(g)).discs[i];
  const c = g.centers[i];
  if (f === undefined || c === undefined) throw new Error(`no disc ${i}`);
  return { x: c.x + sample(f.x, split), y: c.y + sample(f.y, split) };
}

/** The distance from a point to a box centered at (cx, cy) with half-sizes (hw, hh). */
function toBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number): number {
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dy = Math.max(Math.abs(py - cy) - hh, 0);
  return Math.hypot(dx, dy);
}

describe('where the pair sits', () => {
  it('is drawn in the avatar’s own square, so the chip keeps its width and the words do not move', () => {
    for (const g of BOTH) expect(g.box).toBe(TOP_BAR_AVATAR);
    expect(PAIR_BOX).toBe(TOP_BAR_AVATAR);
    // the reason: at the narrow cap a second 31 circle beside the first would leave the words
    // 30 points, which is "Both" itself before the phone's text size grows it
    const words = (w: number) =>
      chipMaxWidth(w) - (space.xs + TOP_BAR_AVATAR + space.md + space.md + 14 + space.lg);
    expect(words(360)).toBe(50);
    expect(words(360) - (TOP_BAR_AVATAR - space.xs)).toBeLessThanOrEqual(30);
  });

  it('draws two babies as two and three as three, and no more than three', () => {
    expect(TWO.centers).toHaveLength(2);
    expect(THREE.centers).toHaveLength(3);
    expect(pairGeometry(4).centers).toHaveLength(PAIR_MAX);
    expect(PAIR_MAX).toBe(3);
  });

  it('keeps every disc inside the pill at every height the chip can have, all the way through', () => {
    // the worst case over everything, reported with where it was, then asserted once
    let worst = { by: Infinity, at: '' };
    for (const g of BOTH)
      for (let h = CHIP.minHeight; h <= 64; h += 1)
        for (const s of ALL_SPLITS)
          g.centers.forEach((_, i) => {
            const c = centerAt(g, i, s);
            const by = insideBy(c.x, c.y, outerOf(g, i), h);
            if (by < worst.by)
              worst = { by, at: `${g.count} discs, disc ${i}, height ${h}, split ${s.toFixed(3)}` };
          });
    expect(worst.by, worst.at).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps every disc clear of the words, the settle included', () => {
    let right = { x: -Infinity, at: '' };
    for (const g of BOTH)
      for (const s of ALL_SPLITS)
        g.centers.forEach((_, i) => {
          const x = CHIP.pad + centerAt(g, i, s).x + outerOf(g, i);
          if (x > right.x) right = { x, at: `${g.count} discs, disc ${i}, split ${s.toFixed(3)}` };
        });
    expect(right.x, right.at).toBeLessThanOrEqual(CHIP.words - 2);
  });

  it('overlaps them — a pair, not dots — and keeps every initial clear of the disc in front', () => {
    for (const g of BOTH) {
      // each disc touches the one before it
      for (let i = 1; i < g.centers.length; i += 1) {
        const a = g.centers[i - 1];
        const b = g.centers[i];
        if (a === undefined || b === undefined) throw new Error('missing disc');
        expect(Math.hypot(b.x - a.x, b.y - a.y), `${g.count}: ${i - 1}–${i}`).toBeLessThan(g.disc);
      }
      // an initial is at most 0.62 em wide (a capital in the app's bold face, with room) and 0.7
      // em tall; no disc drawn later — with its ring — may reach into it
      const hw = 0.31 * g.letter;
      const hh = 0.35 * g.letter;
      g.centers.forEach((back, j) =>
        g.centers.slice(j + 1).forEach((front, k) => {
          const i = j + 1 + k;
          expect(
            toBox(front.x, front.y, back.x, back.y, hw, hh),
            `${g.count}: disc ${i} over the initial of disc ${j}`,
          ).toBeGreaterThanOrEqual(outerOf(g, i));
        }),
      );
    }
  });

  it('writes the initials no smaller than the design system’s smallest letter for two', () => {
    // 9.5 is the badge's size (theme.ts `badge`); three discs are rarer and smaller
    expect(TWO.letter).toBe(9.5);
    expect(THREE.letter).toBeGreaterThanOrEqual(8);
    expect(TWO.letter / TWO.disc).toBeCloseTo(13 / TOP_BAR_AVATAR, 1);
  });

  it('writes the initials in onGradient on the brand gradient: 4.5:1 in every theme and scheme', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEME_NAMES) {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        );
        for (const stop of r.gradient.brand)
          expect(contrastRatio(r.onGradient, stop), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
      }
  });
});

describe('the picture at rest', () => {
  it('is the one avatar at 0: whole, full size, and the discs stacked out of sight under it', () => {
    for (const g of BOTH) {
      const f = pairFrames(g);
      expect(sample(f.single.opacity, 0)).toBe(1);
      expect(sample(f.single.scale, 0)).toBe(1);
      expect(sample(f.discOpacity, 0)).toBe(0);
      g.centers.forEach((_, i) => expect(centerAt(g, i, 0)).toEqual(g.origin));
      expect(g.origin).toEqual({ x: TOP_BAR_AVATAR / 2, y: TOP_BAR_AVATAR / 2 });
    }
  });

  it('is the pair at 1: every disc home and drawn, ringed, and the one avatar gone', () => {
    for (const g of BOTH) {
      const f = pairFrames(g);
      expect(sample(f.single.opacity, 1)).toBe(0);
      expect(sample(f.discOpacity, 1)).toBe(1);
      expect(sample(f.ringOpacity, 1)).toBe(1);
      g.centers.forEach((c, i) => {
        const at = centerAt(g, i, 1);
        expect(at.x).toBeCloseTo(c.x, 9);
        expect(at.y).toBeCloseTo(c.y, 9);
      });
    }
  });
});

describe('the picture on the way', () => {
  const EVERY = (g: PairGeometry, f = pairFrames(g)): [string, Frame][] => {
    return [
      ['single opacity', f.single.opacity],
      ['single scale', f.single.scale],
      ['disc opacity', f.discOpacity],
      ['ring opacity', f.ringOpacity],
      ...f.discs.flatMap((d, i): [string, Frame][] => [
        [`disc ${i} x`, d.x],
        [`disc ${i} y`, d.y],
      ]),
    ];
  };

  it('uses frames Animated can read: ranges inside the split, in order, one output per input', () => {
    for (const g of BOTH)
      for (const [name, fr] of EVERY(g)) {
        expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
        expect(fr.inputRange.length, name).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < fr.inputRange.length; i += 1)
          expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
        expect(fr.inputRange[0] ?? -1, name).toBeGreaterThanOrEqual(0);
        expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, name).toBeLessThanOrEqual(1);
      }
  });

  it('only lets the discs’ travel follow the settle; every fade and the avatar’s size are clamped', () => {
    for (const g of BOTH) {
      const f = pairFrames(g);
      for (const [name, fr] of EVERY(g, f)) {
        const travel = f.discs.some(d => d.x === fr || d.y === fr);
        expect(fr.extrapolate, name).toBe(travel ? 'extend' : 'clamp');
      }
    }
  });

  it('shrinks the one avatar to a disc’s size as it fades, so it hands over rather than vanishing', () => {
    for (const g of BOTH) {
      const f = pairFrames(g);
      const gone = f.single.opacity.inputRange[1] ?? 1;
      expect(sample(f.single.scale, gone)).toBeCloseTo(g.disc / g.box, 9);
      // gone early, before the discs are half way apart
      expect(gone).toBeLessThan(0.5);
      // the discs are drawn before the avatar has begun to show them, so none pops in
      expect(f.discOpacity.inputRange[1] ?? 1).toBeLessThan(0.1);
      expect(sample(f.single.opacity, f.discOpacity.inputRange[1] ?? 1)).toBeGreaterThan(0.8);
      // and the rings come in as the discs part, not while they are one shape under the avatar
      expect(f.ringOpacity.inputRange[0] ?? 0).toBeGreaterThan(0);
    }
  });

  it('slides the discs apart along straight lines from the avatar’s center, each the same way throughout', () => {
    for (const g of BOTH)
      g.centers.forEach((c, i) => {
        let last = -Infinity;
        let backwards = 0;
        let off = 0;
        for (let s = 0; s <= 1; s += 0.01) {
          const at = centerAt(g, i, s);
          const along = Math.hypot(at.x - g.origin.x, at.y - g.origin.y);
          if (along < last - 1e-9) backwards += 1;
          last = along;
          // on the line from the origin to its place
          const cross =
            (at.x - g.origin.x) * (c.y - g.origin.y) - (at.y - g.origin.y) * (c.x - g.origin.x);
          off = Math.max(off, Math.abs(cross));
        }
        expect(backwards, `${g.count}/${i} turned back`).toBe(0);
        expect(off, `${g.count}/${i} left its line`).toBeLessThan(1e-9);
      });
  });

  it('settles a hair past home and back — a visible settle, well under a point', () => {
    expect(PEAK).toBeGreaterThan(1.03);
    expect(PEAK).toBeLessThan(1.12);
    for (const g of BOTH)
      g.centers.forEach(c => {
        const home = Math.hypot(c.x - g.origin.x, c.y - g.origin.y);
        expect((PEAK - 1) * home).toBeLessThan(1);
      });
    // an easing's x control points must stay in [0, 1] or the curve is not a function of time
    expect(PAIR_EASE[0]).toBeGreaterThanOrEqual(0);
    expect(PAIR_EASE[2]).toBeLessThanOrEqual(1);
  });
});

describe('the move', () => {
  it('draws a pair only for Both, and only with two or more babies to draw', () => {
    expect(pairShown(true, [{}, {}])).toBe(true);
    expect(pairShown(true, [{}, {}, {}])).toBe(true);
    expect(pairShown(true, [{}])).toBe(false);
    expect(pairShown(true, undefined)).toBe(false);
    expect(pairShown(false, [{}, {}])).toBe(false);
  });

  it('animates a split and a merge, and sets the end state at once when nothing may move', () => {
    expect(pairMove(true, false)).toEqual({ to: 1, animate: true, duration: PAIR_MS });
    expect(pairMove(false, false)).toEqual({ to: 0, animate: true, duration: PAIR_MS });
    // reduce motion or amber night: the same end, no movement
    expect(pairMove(true, true)).toEqual({ to: 1, animate: false, duration: 0 });
    expect(pairMove(false, true)).toEqual({ to: 0, animate: false, duration: 0 });
  });

  it('waits for the switcher’s sheet exactly as long as the sheet takes to leave', () => {
    const sheet = read('BottomSheet.tsx');
    const m = /export const SHEET_DURATION_MS = (\d+);/.exec(sheet);
    expect(m).not.toBe(null);
    expect(PAIR_AFTER_SHEET_MS).toBe(Number(m?.[1]));
  });
});

describe('the chip (tripwires over ChildChip.tsx)', () => {
  it('is the same one button: its role, its name, its expanded state and its id are untouched', () => {
    expect(flat).toContain('accessibilityRole="button"');
    expect(flat).toContain("const shown = isBoth ? 'Both' : name;");
    // the name is composed in one pure place, which says it exactly as it always was when there is
    // no month-day to add (`partyHat.test.ts` holds that)
    expect(flat).toContain('const label = childChipLabel(shown, ageLabel, monthDay);');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityState={expanded !== undefined ? { expanded } : {}}');
    expect(flat).toContain('{...(testID ? { testID } : {})}');
    // the 44 target still comes from the hit slop
    expect(flat).toContain('hitSlop={{ top: slop, bottom: slop }}');
    expect(chip.split('<Pressable')).toHaveLength(2);
  });

  it('keeps the drawing out of touch and out of the accessibility tree', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style=\{\[styles\.square/,
    );
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): num\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'scale'], prop).toContain(prop);
    expect(flat).toContain('Easing.bezier(...PAIR_EASE)');
  });

  it('reads reduce motion and the amber night from the theme, and sets the value over a split in flight', () => {
    expect(flat).toContain('pairMove(paired, t.reduceMotion || t.isNight)');
    expect(flat).toContain('if (!move.animate) { split.setValue(move.to);');
    expect(flat).toContain('[split, paired, t.reduceMotion, t.isNight]');
  });

  it('waits for the switcher only when it was open, and reads that before the switcher’s own effect', () => {
    expect(flat).toContain('delay: wasOpen.current ? PAIR_AFTER_SHEET_MS : 0,');
    const split = flat.indexOf('const move = pairMove(');
    const open = flat.indexOf('wasOpen.current = expanded === true;');
    expect(split).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(split);
  });

  it('draws Both as the one avatar it always was when no faces are handed in', () => {
    expect(flat).toContain('const paired = pairShown(isBoth, faces);');
    expect(flat).toContain('pair !== null ? anim.one : null');
    expect(flat).toContain(
      '{pair !== null ? ( <Pair g={g} faces={pair} anim={anim} failed={failed} onFail={fail} /> ) : null}',
    );
  });

  it('hides a baby’s picture in night on a disc, as the chip hides its own', () => {
    // `shownPhoto` (photoTrouble.ts): none at night, and none once that very picture would not load
    expect(flat).toContain('const photo = shownPhoto(face?.photoUri, t.isNight, failed);');
    expect(flat).toContain(
      'const photo = isBoth ? undefined : shownPhoto(photoUri, t.isNight, failed);',
    );
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...chip.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'expo-linear-gradient'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(chip).not.toContain('reanimated');
  });

  it('writes no color: every fill is the theme’s', () => {
    for (const src of [chip, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
    expect(flat).toContain('backgroundColor: t.color.surfaceSolid');
    expect(flat).toContain('color={t.onGradient}');
  });

  it('is handed its faces by the top bar, which keeps the chip’s id', () => {
    const bar = withoutComments(read('TopBar.tsx')).replace(/\s+/g, ' ');
    expect(bar).toContain('faces?: readonly ChildFace[];');
    expect(bar).toContain('{...(child.faces !== undefined ? { faces: child.faces } : {})}');
    expect(bar).toContain('{...(testID ? { testID: `${testID}.child` } : {})}');
  });
});
