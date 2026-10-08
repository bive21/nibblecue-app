/**
 * THE LOADER (the owner, 2026-09-26: *"our loading icon shuold be our logo spinning non stop in an
 * infinity shape"*). Two halves, the way this package tests anything that moves: the curve, the
 * frames, the boxes, the inks and the still rule are PURE (`logoLoader.ts`) and are sampled here the
 * way `Animated.Value#interpolate` would sample them; what can only be seen on a device — that the
 * loader runs on the native driver, turns the mark where it has arrived, falls back to the platform
 * spinner with no mark installed, and that a waiting Button keeps its size and hides the loader from
 * assistive technology — is held by tripwires over `LogoLoader.tsx` and `Button.tsx`, because this
 * suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
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
import { AA_GRAPHIC, contrastRatio, withAlpha } from '../theme/contrast';
import { moduleButtonPaint, type TintModule } from '../theme/moduleButton';
import { hit, moduleColor, paletteFor, resolvePalette, themeNames } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { loaderMark, setLoaderMark } from './loaderMark';
import {
  LOADER_BREATH,
  LOADER_BREATH_FLOOR,
  LOADER_BREATH_MS,
  LOADER_DELAY_MS,
  LOADER_FADE_MS,
  LOADER_FRAMES,
  LOADER_LABEL,
  LOADER_LEAN_MAX,
  LOADER_LEAN_SHARE,
  LOADER_LOOP_MS,
  LOADER_SIZE,
  LOADER_TRACK_ALPHA,
  leanFor,
  lemniscateLength,
  lemniscatePoint,
  lemniscateSpeed,
  loaderFrames,
  loaderInks,
  loaderMotion,
  loaderStops,
  loaderTrack,
  type LoaderVariant,
} from './logoLoader';
import { motionStill } from './tickDraw';

/** Every module a log sheet's buttons can wear (`ModuleTint`). */
const MODULE_IDS = Object.keys(moduleColor) as TintModule[];

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the components explain their own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (f: string) => withoutComments(read(f)).replace(/\s+/g, ' ');

const VARIANTS: readonly LoaderVariant[] = ['small', 'large'];
const N = LOADER_FRAMES;

/** Where a frame's value is at `p` of its clock, as `interpolate` reads it: piecewise-linear. */
function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  if (p <= (xs[0] ?? 0)) return ys[0] ?? 0;
  if (p >= (xs[last] ?? 1)) return ys[last] ?? 0;
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
  return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
}

/** Every point a frame can draw, near enough: each keyframe and a dozen between each pair. */
const EVERYWHERE = Array.from({ length: N * 12 + 1 }, (_, i) => i / (N * 12));

/** Half the width (and height) of a square `side` across, turned `lean` degrees about its center. */
const turnedHalf = (side: number, lean: number): number => {
  const r = (lean * Math.PI) / 180;
  return (side / 2) * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)));
};

/** How far from the box's middle the turned mark reaches, across and up, over the whole loop. */
function reachOf(variant: LoaderVariant): { x: number; y: number } {
  const f = loaderFrames(variant);
  const m = LOADER_SIZE[variant].mark;
  let x = 0;
  let y = 0;
  for (const p of EVERYWHERE) {
    const half = turnedHalf(m, sample(f.lean, p));
    x = Math.max(x, Math.abs(sample(f.x, p)) + half);
    y = Math.max(y, Math.abs(sample(f.y, p)) + half);
  }
  return { x, y };
}

describe('the curve', () => {
  const reach = LOADER_SIZE.large.reach;
  const stops = loaderStops(reach);

  /** Bernoulli's own equation, F = (x² + y²)² − a²(x² − y²), which is 0 exactly on the curve. */
  const bernoulli = (x: number, y: number) => (x * x + y * y) ** 2 - reach ** 2 * (x * x - y * y);

  it("is Bernoulli's lemniscate: the curve is on (x² + y²)² = a²(x² − y²) all the way round", () => {
    for (let k = 0; k <= 720; k++) {
      const [x, y] = lemniscatePoint(reach, (k / 720) * 2 * Math.PI);
      expect(Math.abs(bernoulli(x, y)), `t = ${k}/720 of a turn`).toBeLessThan(1e-6 * reach ** 4);
    }
  });

  it('and every stop is on it, to the thousandth of a point it is kept to', () => {
    for (const [i, p] of stops.entries()) {
      const f = bernoulli(p.x, p.y);
      // F over its gradient is the distance to the curve, near enough; at the crossing both are 0
      const r2 = p.x * p.x + p.y * p.y;
      const gx = 4 * p.x * r2 - 2 * reach ** 2 * p.x;
      const gy = 4 * p.y * r2 + 2 * reach ** 2 * p.y;
      const off = Math.abs(f) < 1e-9 ? 0 : Math.abs(f) / Math.hypot(gx, gy);
      expect(off, `stop ${i}`).toBeLessThan(1e-3);
    }
  });

  it('is its length: twice the lemniscate constant, 5.2441 × a', () => {
    expect(lemniscateLength(1)).toBeCloseTo(5.244115, 5);
  });

  it('closes: the last stop is the first, so a clock jumping from 1 to 0 lands where it already is', () => {
    for (const v of VARIANTS) {
      const f = loaderFrames(v);
      for (const fr of [f.x, f.y, f.lean]) {
        expect(fr.outputRange).toHaveLength(N + 1);
        expect(fr.outputRange[N], v).toBe(fr.outputRange[0]);
        expect(fr.inputRange[0]).toBe(0);
        expect(fr.inputRange[N]).toBe(1);
      }
    }
  });

  it('crosses itself at its center, at the start and half way round, and nowhere else', () => {
    const at = stops.flatMap((p, i) => (Math.hypot(p.x, p.y) < 1e-6 ? [i] : []));
    expect(at).toEqual([0, N / 2, N]);
  });

  it('reaches its far ends at the quarters, standing upright there', () => {
    expect(stops[N / 4]).toEqual({ x: reach, y: 0, lean: 0 });
    expect(stops[(3 * N) / 4]).toEqual({ x: -reach, y: 0, lean: 0 });
  });

  it('dives through the middle and climbs at the ends', () => {
    // leaving the crossing: down (y grows) and to the right
    expect(stops[1]?.x).toBeGreaterThan(0);
    expect(stops[1]?.y).toBeGreaterThan(0);
    // at the right-hand end: climbing
    expect(stops[N / 4 + 1]?.y).toBeLessThan(0);
    expect(stops[N / 4 - 1]?.y).toBeGreaterThan(0);
  });

  it('is symmetric: its second half is its first mirrored left to right, leaning the other way', () => {
    for (let i = 0; i <= N / 2; i++) {
      const [a, b] = [stops[i], stops[i + N / 2]];
      expect(b?.x, `stop ${i}`).toBeCloseTo(-(a?.x ?? 0), 2);
      expect(b?.y, `stop ${i}`).toBeCloseTo(a?.y ?? 0, 2);
      expect(b?.lean, `stop ${i}`).toBeCloseTo(-(a?.lean ?? 0), 2);
    }
  });

  it('and each loop is its own mirror top to bottom', () => {
    for (let i = 0; i <= N / 2; i++) {
      const [a, b] = [stops[i], stops[N / 2 - i]];
      expect(b?.x, `stop ${i}`).toBeCloseTo(a?.x ?? 0, 2);
      expect(b?.y, `stop ${i}`).toBeCloseTo(-(a?.y ?? 0), 2);
      expect(b?.lean, `stop ${i}`).toBeCloseTo(-(a?.lean ?? 0), 2);
    }
  });

  it('runs at an even pace: every step between keyframes covers the same distance', () => {
    for (const v of VARIANTS) {
      const s = loaderStops(LOADER_SIZE[v].reach);
      const chords = s
        .slice(1)
        .map((p, i) => Math.hypot(p.x - (s[i]?.x ?? 0), p.y - (s[i]?.y ?? 0)));
      // a chord is a hair shorter than its arc where the curve bends hardest; 1% covers that
      expect(Math.max(...chords) / Math.min(...chords), v).toBeLessThan(1.01);
    }
  });

  it('which even steps of t would not be: the curve runs √2 times as fast at its ends as through its middle', () => {
    expect(lemniscateSpeed(1, 0) / lemniscateSpeed(1, Math.PI / 2)).toBeCloseTo(Math.SQRT2, 9);
  });
});

describe('the lean', () => {
  const stops = loaderStops(LOADER_SIZE.large.reach);

  it('never passes the clamp, and the clamp is a lean — the mark is never on its side, let alone upside down', () => {
    expect(LOADER_LEAN_MAX).toBeGreaterThanOrEqual(15);
    expect(LOADER_LEAN_MAX).toBeLessThanOrEqual(20);
    for (const v of VARIANTS)
      for (const lean of loaderFrames(v).lean.outputRange)
        expect(Math.abs(lean)).toBeLessThanOrEqual(LOADER_LEAN_MAX);
  });

  it('is a share of how far the heading has turned from straight up, clamped', () => {
    expect(leanFor(-90)).toBe(0); // climbing a far end
    expect(leanFor(0)).toBeCloseTo(LOADER_LEAN_SHARE * 90, 9); // heading right
    expect(leanFor(-180)).toBeCloseTo(-LOADER_LEAN_SHARE * 90, 9); // heading left
    expect(leanFor(45)).toBe(LOADER_LEAN_MAX); // through the crossing, down and to the right
    expect(leanFor(-225)).toBe(-LOADER_LEAN_MAX); // through the crossing, down and to the left
  });

  it('leans into its heading: right while it heads right, left while it heads left', () => {
    const step = lemniscateLength(LOADER_SIZE.large.reach) / N;
    for (let i = 1; i < N; i++) {
      const dx = (stops[i + 1]?.x ?? 0) - (stops[i - 1]?.x ?? 0);
      const lean = stops[i]?.lean ?? 0;
      // where it moves across at all; at the far ends it is climbing, and upright
      if (Math.abs(dx) > 0.2 * step) expect(Math.sign(lean), `stop ${i}`).toBe(Math.sign(dx));
    }
  });

  it('turns smoothly: no step between keyframes turns the mark more than a few degrees', () => {
    for (let i = 1; i <= N; i++)
      expect(Math.abs((stops[i]?.lean ?? 0) - (stops[i - 1]?.lean ?? 0)), `stop ${i}`).toBeLessThan(
        3,
      );
  });
});

describe('the box', () => {
  for (const v of VARIANTS) {
    const size = LOADER_SIZE[v];

    it(`${v}: keeps the turned mark inside its box at every point a frame can draw`, () => {
      const r = reachOf(v);
      expect(r.x, 'across').toBeLessThanOrEqual(size.box.width / 2);
      expect(r.y, 'up and down').toBeLessThanOrEqual(size.box.height / 2);
    });

    it(`${v}: is no more than a point bigger than that on any side`, () => {
      const r = reachOf(v);
      expect(size.box.width / 2 - r.x).toBeLessThanOrEqual(1);
      expect(size.box.height / 2 - r.y).toBeLessThanOrEqual(1);
    });

    it(`${v}: is even, so the ∞'s center and the resting mark fall on whole points`, () => {
      expect(size.box.width % 2).toBe(0);
      expect(size.box.height % 2).toBe(0);
      expect(Number.isInteger((size.box.width - size.mark) / 2)).toBe(true);
      expect(Number.isInteger((size.box.height - size.mark) / 2)).toBe(true);
    });

    it(`${v}: keeps the track inside the box, stroke and all, crossing at its middle`, () => {
      const d = loaderTrack(v);
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      const points = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [
        Number(m[1]),
        Number(m[2]),
      ]);
      expect(points.length).toBeGreaterThan(N);
      const half = size.stroke / 2;
      for (const [x = 0, y = 0] of points) {
        expect(x - half).toBeGreaterThanOrEqual(0);
        expect(x + half).toBeLessThanOrEqual(size.box.width);
        expect(y - half).toBeGreaterThanOrEqual(0);
        expect(y + half).toBeLessThanOrEqual(size.box.height);
      }
      expect(points[0]).toEqual([size.box.width / 2, size.box.height / 2]);
    });
  }

  it('fits a waiting button with room: 6 pt or more clear above and below at 44, and inside the 34 pt pill', () => {
    const { height, width } = LOADER_SIZE.small.box;
    expect(hit.min - height).toBeGreaterThanOrEqual(12);
    expect(height).toBeLessThanOrEqual(34);
    // narrower than the narrowest default button: its two paddings (18 each) and one short word
    expect(width).toBeLessThanOrEqual(2 * 18 + 20);
  });
});

describe('the timing', () => {
  it('goes round once every 1.6 to 2 seconds', () => {
    expect(LOADER_LOOP_MS).toBeGreaterThanOrEqual(1600);
    expect(LOADER_LOOP_MS).toBeLessThanOrEqual(2000);
  });

  it('waits long enough at boot that a quick launch never flashes it, and then fades in quickly', () => {
    expect(LOADER_DELAY_MS).toBeGreaterThanOrEqual(300);
    expect(LOADER_DELAY_MS).toBeLessThanOrEqual(600);
    expect(LOADER_FADE_MS).toBeLessThanOrEqual(300);
  });

  it('breathes slowly, between a third and full strength, when it may not travel', () => {
    expect(LOADER_BREATH.outputRange).toEqual([1, LOADER_BREATH_FLOOR]);
    expect(LOADER_BREATH_FLOOR).toBeGreaterThanOrEqual(0.3);
    expect(LOADER_BREATH_FLOOR).toBeLessThanOrEqual(0.4);
    expect(LOADER_BREATH_MS).toBeGreaterThanOrEqual(1000);
    // every breath is well under one a second: nowhere near a flash (WCAG 2.3.1)
    expect(1000 / (2 * LOADER_BREATH_MS)).toBeLessThan(1);
  });

  it('shares frozen frames, so no caller can bend the ∞ for every other loader', () => {
    for (const v of VARIANTS) {
      const f = loaderFrames(v);
      for (const fr of [f.x, f.y, f.lean]) {
        expect(Object.isFrozen(fr)).toBe(true);
        expect(Object.isFrozen(fr.inputRange)).toBe(true);
        expect(Object.isFrozen(fr.outputRange)).toBe(true);
      }
    }
    expect(Object.isFrozen(LOADER_BREATH)).toBe(true);
  });
});

describe('when nothing may move', () => {
  it('travels only when the phone allows motion and the theme is not the amber night', () => {
    for (const theme of themeNames) {
      expect(loaderMotion(true, theme), `reduce motion, ${theme}`).toBe('breathe');
      expect(loaderMotion(false, theme), theme).toBe(theme === 'night' ? 'breathe' : 'travel');
      // the one rule every moving picture in this package keeps, not a second copy of it
      for (const reduce of [true, false])
        expect(loaderMotion(reduce, theme) === 'breathe').toBe(motionStill(reduce, theme));
    }
  });

  it('rests at the crossing, upright, and changes only its strength', () => {
    const src = flat('LogoLoader.tsx');
    expect(src).toContain("still={loaderMotion(t.reduceMotion, t.theme) === 'breathe'}");
    expect(src).toContain('still ? resting : moving');
    // at rest: an opacity and nothing else — no transform, so it sits where its box puts it
    expect(src).toMatch(
      /const resting = useMemo<AnimatedStyle>\(\s?\(\) => \(\{ opacity: num\(breath, LOADER_BREATH\) \}\),\s?\[breath\]/,
    );
    // and its box is on the ∞'s center
    expect(src).toContain('left: (width - size.mark) / 2, top: (height - size.mark) / 2');
  });
});

describe('the inks', () => {
  const light = paletteFor('light');

  it('draws a tint as the silhouette, and the track as that same ink, faint', () => {
    const ink = light.text;
    expect(loaderInks(light, 'light', ink)).toEqual({
      mark: ink,
      track: withAlpha(ink, LOADER_TRACK_ALPHA),
      spinner: ink,
    });
  });

  it("draws no tint as the artwork's own colors, on the theme's hairline, by day and in dark", () => {
    for (const theme of ['light', 'dark'] as const)
      for (const scheme of SCHEME_NAMES) {
        const c = resolvePalette(theme, scheme);
        const inks = loaderInks(c, theme);
        expect(inks.mark, `${scheme}/${theme}`).toBeNull();
        expect(inks.track).toBe(c.line2);
      }
  });

  it("draws the amber night in the night's own inks only — whatever the scheme — and at 3:1 or better", () => {
    const night = paletteFor('night');
    for (const scheme of SCHEME_NAMES) {
      const c = resolvePalette('night', scheme);
      const inks = loaderInks(c, 'night');
      // text2 and line2 are night's own: a scheme overlays neither
      expect(inks.mark, scheme).toBe(night.text2);
      expect(inks.track, scheme).toBe(night.line2);
      expect(contrastRatio(inks.mark ?? '', c.app), scheme).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(inks.mark ?? '', c.paper), scheme).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  /*
    A BUTTON'S SILHOUETTE IS ITS LABEL'S INK, on the button's own fill. The token gate holds the
    words at 4.5:1 there already; this holds the mark to the 3:1 a graphic needs, directly, over
    every scheme and theme — both ends of primary's gradient, and every ground a ghost button is
    put on. (The accent under primary's gradient is not its ground: it is there for a frame in which
    the gradient paints nothing, Button.tsx says why, and the gradient covers it everywhere else.)
    The ink per variant is Button.tsx's, held just below.
  */
  it("draws a waiting button's mark at 3:1 or better on the button's own fill, in every scheme and theme", () => {
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        );
        const c = r.palette;
        const fills: [string, string, string[]][] = [
          ['primary', r.onGradient, [...r.gradient.brand]],
          ['danger', r.onGradient, [c.dangerFill]],
          ['secondary', c.text, [c.surfaceSolid]],
          ['ghost', c.accent2, [c.app, c.paper, c.surfaceSolid]],
          // a log sheet's primary, in its module's deep ink (`moduleButton.ts`); none in Night
          ...MODULE_IDS.flatMap((m): [string, string, string[]][] => {
            const paint = moduleButtonPaint(m, theme);
            return paint === null ? [] : [[`primary (${m})`, paint.ink, [paint.fill]]];
          }),
        ];
        for (const [variant, ink, grounds] of fills)
          for (const ground of grounds)
            expect(
              contrastRatio(loaderInks(c, theme, ink).mark ?? '', ground),
              `${scheme}/${theme}: ${variant} on ${ground}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });

  it("is handed the label's own ink by the button, per variant, as measured above", () => {
    const src = flat('Button.tsx');
    expect(src).toContain(
      "const ink = tinted !== null ? tinted.ink : variant === 'primary' ? t.onGradient : variant === 'danger' ? t.onGradient : variant === 'secondary' ? t.color.text : t.color.accent2;",
    );
    expect(src).toContain('<LogoLoader variant="small" tint={ink} />');
  });
});

describe('the registry', () => {
  it('holds no mark until the app installs one, gives back what it was given, and can be emptied', () => {
    expect(loaderMark()).toBeNull();
    setLoaderMark(7);
    expect(loaderMark()).toBe(7);
    setLoaderMark(null);
    expect(loaderMark()).toBeNull();
  });

  it("draws the platform's spinner in the mark's ink while there is none — a waiting button's, exactly as before", () => {
    const src = flat('LogoLoader.tsx');
    expect(src).toContain('const mark = loaderMark();');
    expect(src).toMatch(
      /if \(mark === null\) \{ return \( <View \{\.\.\.a11y\} pointerEvents="none" style=\{\[styles\.center, frame\]\}> <ActivityIndicator color=\{inks\.spinner\} size=\{variant === 'large' \? 'large' : 'small'\} \/>/,
    );
    // a button's tint is its spinner's color, and a small loader is the platform's small spinner
    const ink = paletteFor('light').text;
    expect(loaderInks(paletteFor('light'), 'light', ink).spinner).toBe(ink);
  });
});

describe('LogoLoader (tripwires: what only a device can show)', () => {
  const src = flat('LogoLoader.tsx');

  it('runs every clock on the native driver, and never one from JavaScript', () => {
    const timings = src.match(/Animated\.timing\(/g) ?? [];
    expect(timings.length).toBeGreaterThan(0);
    expect(src.match(/useNativeDriver: true/g) ?? []).toHaveLength(timings.length);
    expect(src).not.toContain('useNativeDriver: false');
    expect(src).toContain('easing: Easing.linear');
  });

  it('moves the mark by translating it and then turning it where it has arrived — nothing else', () => {
    expect(src).toContain(
      'transform: [ { translateX: num(travel, f.x) }, { translateY: num(travel, f.y) }, { rotate: deg(travel, f.lean) }, ]',
    );
    expect(src).not.toMatch(/scale:|width: num|left: num|top: num/);
  });

  it('starts each loop from its own beginning, because a native loop repeats from where it began', () => {
    expect(src).toContain('if (still) breath.setValue(1); else travel.setValue(0);');
    expect(src.indexOf('travel.setValue(0)')).toBeLessThan(src.indexOf('loop.start()'));
    expect(src).toContain('return () => loop.stop();');
  });

  it('is one busy progressbar, named "Loading" unless the caller names it', () => {
    expect(LOADER_LABEL).toBe('Loading');
    expect(src).toContain('accessibilityLabel = LOADER_LABEL');
    expect(src).toContain(
      "accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel, accessibilityState: { busy: true },",
    );
    // never a target: a loader over a button must not take the button's tap
    expect(src.match(/pointerEvents="none"/g)).toHaveLength(2);
  });

  it('draws the silhouette through tintColor, and the artwork untouched otherwise', () => {
    expect(src).toContain('inks.mark === null ? null : { tintColor: inks.mark }');
    expect(src).toContain('const inks = loaderInks(t.color, t.theme, tint);');
    expect(src).toMatch(/<Path d=\{loaderTrack\(variant\)\} fill="none" stroke=\{inks\.track\}/);
  });

  it('keeps Smart Invert off the artwork only: a silhouette inverts with the words beside it', () => {
    expect(src).toContain('accessibilityIgnoresInvertColors={inks.mark === null}');
  });

  it('draws a fresh mark when the way of waiting changes, so no lean or fade the native driver set survives it', () => {
    expect(src).toContain("<Animated.View key={still ? 'resting' : 'moving'}");
  });
});

describe('Button: a button waiting on the server', () => {
  const src = flat('Button.tsx');

  it('keeps its words laid out, unseen, so it keeps its width and height while it waits', () => {
    // the words and the glyph are drawn whatever the state — never swapped out for the loader
    expect(src).not.toMatch(/!loading \?|!loading &&/);
    expect(src).toContain('loading ? styles.held : null');
    expect(src).toContain('held: { opacity: 0 }');
  });

  it('draws the small loader in its own ink over them, hidden from touch and from assistive technology', () => {
    expect(src).toContain(
      '{loading ? ( <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.busy]} > <LogoLoader variant="small" tint={ink} /> </View> ) : null}',
    );
    expect(src).toContain("busy: { alignItems: 'center', justifyContent: 'center' }");
  });

  it('still says busy, and still cannot be pressed twice', () => {
    expect(src).toContain('accessibilityState={{ disabled: inert, busy: !!loading }}');
    expect(src).toContain('const inert = !!disabled || !!loading;');
  });

  it('leaves the spinner to the loader, which draws the same one in the same ink when there is no mark', () => {
    expect(src).not.toContain('ActivityIndicator');
  });
});
