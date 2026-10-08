/**
 * THE DAY/NIGHT SWITCH (the owner, 2026-09-25: setup's "Try me" as "an interesting animation
 * toggle", after a sun-and-moon switcher). Two halves, the way this package tests anything that
 * moves: the picture at every point of its one animated value is PURE (`dayNightSwitch.ts`) and is
 * sampled here exactly as `Animated.Value#interpolate` would sample it; what can only be seen on a
 * device — that the component is one switch to a screen reader, runs on the native driver and
 * honors reduce motion — is held by tripwires over `DayNightSwitch.tsx`, because this suite has no
 * renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import { badgeColors } from './badge-tone';
import {
  CLOUD,
  CRATERS,
  DAY_NIGHT_EASE,
  DAY_NIGHT_MS,
  DAY_NIGHT_SIZE,
  dayNightFrames,
  dayNightGeometry,
  dayNightMove,
  progressFor,
  STARS,
  WISP,
  type Frame,
} from './dayNightSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('DayNightSwitch.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('dayNightSwitch.ts'));

const g = dayNightGeometry();
const f = dayNightFrames(g);

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
function peakOf([, y1, , y2]: readonly [number, number, number, number]): number {
  let peak = 0;
  for (let i = 0; i <= 2000; i += 1) {
    const s = i / 2000;
    peak = Math.max(peak, 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3);
  }
  return peak;
}

/** Whether a point is inside the pill, a `margin` in from its edge (a stadium: two caps and a band). */
function insidePill(x: number, y: number, margin: number): boolean {
  const r = g.height / 2;
  const cx = Math.min(Math.max(x, r), g.width - r);
  return Math.hypot(x - cx, y - r) <= r - margin;
}

const EVERY: readonly [string, Frame][] = [
  ...Object.entries(f).filter((e): e is [string, Frame] => !Array.isArray(e[1])),
  ...f.stars.flatMap((s, i): [string, Frame][] => [
    [`star ${i} opacity`, s.opacity],
    [`star ${i} scale`, s.scale],
  ]),
];
const STEPS = Array.from({ length: 101 }, (_, i) => i / 100);

describe('the size of it', () => {
  it('is a pill with a round knob inside it, and a target no smaller than 44', () => {
    expect(g.knob).toBe(DAY_NIGHT_SIZE.height - 2 * DAY_NIGHT_SIZE.inset);
    expect(g.travel).toBe(DAY_NIGHT_SIZE.width - g.knob - 2 * DAY_NIGHT_SIZE.inset);
    expect(g.width).toBeGreaterThan(g.height);
    // the pill itself is 34 tall; the Pressable around it is the 44 (CLAUDE.md §6)
    expect(flat).toContain('minHeight: t.hit.min, minWidth: t.hit.min');
    expect(g.width).toBeGreaterThanOrEqual(44);
  });

  it('rolls the knob as far as a wheel of its size would turn over that distance', () => {
    expect(g.roll).toBeCloseTo((g.travel / (g.knob / 2)) * (180 / Math.PI), 6);
    expect(sample(f.sunTurn, 1) - sample(f.sunTurn, 0)).toBeCloseTo(g.roll, 6);
    expect(sample(f.moonTurn, 1) - sample(f.moonTurn, 0)).toBeCloseTo(g.roll, 6);
  });

  it('overshoots a hair and settles, and never so far that the knob touches the rim', () => {
    const peak = peakOf(DAY_NIGHT_EASE);
    // there IS a settle — the knob carries past and comes back — but a small one
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.08);
    // past its rest by (peak − 1) of the travel, at either end, and the room there is the inset
    // less the rim drawn inside it
    expect((peak - 1) * g.travel).toBeLessThan(g.inset - g.rim);
    // an easing's x control points must stay in [0, 1] or the curve is not a function of time
    expect(DAY_NIGHT_EASE[0]).toBeGreaterThanOrEqual(0);
    expect(DAY_NIGHT_EASE[2]).toBeLessThanOrEqual(1);
  });
});

describe('the picture at rest', () => {
  it('is day with the switch off: the sun, the cloud, no night and no stars', () => {
    expect(progressFor(false)).toBe(0);
    expect(sample(f.knobX, 0)).toBe(0);
    expect(sample(f.sunOpacity, 0)).toBe(1);
    expect(sample(f.moonOpacity, 0)).toBe(0);
    expect(sample(f.nightSky, 0)).toBe(0);
    expect(sample(f.cloudOpacity, 0)).toBe(CLOUD.alpha);
    expect(sample(f.wispOpacity, 0)).toBe(WISP.alpha);
    for (const s of f.stars) expect(sample(s.opacity, 0)).toBe(0);
    expect(sample(f.knobStretch, 0)).toBe(1);
    expect(sample(f.haloOpacity, 0)).toBe(1);
  });

  it('is night with the switch on: the moon upright, the stars out, the clouds gone', () => {
    expect(progressFor(true)).toBe(1);
    expect(sample(f.knobX, 1)).toBe(g.travel);
    expect(sample(f.sunOpacity, 1)).toBe(0);
    expect(sample(f.moonOpacity, 1)).toBe(1);
    // the craters are drawn upright, and the moon arrives at exactly that angle
    expect(sample(f.moonTurn, 1)).toBe(0);
    expect(sample(f.nightSky, 1)).toBe(1);
    expect(sample(f.cloudOpacity, 1)).toBe(0);
    expect(sample(f.wispOpacity, 1)).toBe(0);
    for (const s of f.stars) {
      expect(sample(s.opacity, 1)).toBe(1);
      expect(sample(s.scale, 1)).toBe(1);
    }
    expect(sample(f.knobStretch, 1)).toBe(1);
    expect(sample(f.starsX, 1)).toBe(0);
  });
});

describe('the picture on the way', () => {
  it('uses frames Animated can read: ranges inside the flip, in order, one output per input', () => {
    for (const [name, fr] of EVERY) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      expect(fr.inputRange.length, name).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.inputRange[0] ?? -1, name).toBeGreaterThanOrEqual(0);
      expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, name).toBeLessThanOrEqual(1);
    }
  });

  it('only lets the knob and its turn follow the overshoot; every fade is clamped', () => {
    for (const [name, fr] of EVERY) {
      const follows = fr === f.knobX || fr === f.sunTurn || fr === f.moonTurn;
      expect(fr.extrapolate, name).toBe(follows ? 'extend' : 'clamp');
    }
  });

  it('moves the knob one way only, and keeps it a solid knob all the way across', () => {
    for (let i = 1; i < STEPS.length; i += 1)
      expect(sample(f.knobX, STEPS[i] ?? 0)).toBeGreaterThanOrEqual(
        sample(f.knobX, STEPS[i - 1] ?? 0),
      );
    // the faces cross over rather than stack: never both at full strength at once
    for (const p of STEPS)
      expect(sample(f.sunOpacity, p) + sample(f.moonOpacity, p), `at ${p}`).toBeLessThan(2);
    // and the body under them is drawn whatever the faces are doing, so the knob never goes
    // see-through mid-fade
    expect(flat).toContain('backgroundColor: sky.sun[1]');
  });

  it('brings the stars on one after another, each with one twinkle, as the moon arrives', () => {
    const starts = STARS.map(s => s.at);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    // no star before the knob is half way: they come out as night does
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(0.4);
    for (const s of f.stars) {
      const seen = STEPS.map(p => sample(s.opacity, p));
      // "full" within float error: a keyframe at `at + 0.12` is not exactly a hundredth step
      const top = seen.findIndex(o => o > 0.99);
      expect(top).toBeGreaterThan(0);
      // after first reaching full, it dips (the twinkle) and comes back to full
      const after = seen.slice(top);
      expect(Math.min(...after)).toBeLessThan(0.6);
      expect(after[after.length - 1]).toBe(1);
      // and it grows past its size and settles back
      expect(Math.max(...STEPS.map(p => sample(s.scale, p)))).toBeGreaterThan(1);
    }
  });

  it('parts the clouds: both drift out to the right, the wisp further and sooner', () => {
    expect(sample(f.cloudX, 1)).toBe(CLOUD.drift);
    expect(sample(f.wispX, 1)).toBe(WISP.drift);
    expect(WISP.drift).toBeGreaterThan(CLOUD.drift);
    expect(f.wispX.inputRange[1] ?? 1).toBeLessThan(f.cloudX.inputRange[1] ?? 0);
    // gone before the stars begin to show
    expect(f.cloudOpacity.inputRange[1] ?? 1).toBeLessThanOrEqual(
      Math.min(...STARS.map(s => s.at)),
    );
  });
});

describe('where the scenery sits', () => {
  const knobAt = (p: 0 | 1) => {
    const left = g.inset + sample(f.knobX, p);
    return { left, right: left + g.knob };
  };

  it('keeps the stars clear of the moon, and inside the pill', () => {
    const moon = knobAt(1);
    for (const s of STARS) {
      expect(s.x + s.size / 2, `star at ${s.x}`).toBeLessThan(moon.left);
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        expect(insidePill(s.x + (dx * s.size) / 2, s.y + (dy * s.size) / 2, g.rim)).toBe(true);
    }
  });

  it('keeps the clouds clear of the sun, and inside the pill while it is day', () => {
    const sun = knobAt(0);
    for (const c of [CLOUD, WISP]) {
      expect(c.x).toBeGreaterThanOrEqual(sun.right);
      for (const [x, y] of [
        [c.x, c.y],
        [c.x + c.width, c.y],
        [c.x, c.y + c.height],
        [c.x + c.width, c.y + c.height],
      ] as const)
        expect(insidePill(x, y, g.rim), `cloud corner ${x},${y}`).toBe(true);
    }
  });

  it('keeps the craters on the moon', () => {
    for (const c of CRATERS) expect(Math.hypot(c.cx - 0.5, c.cy - 0.5) + c.r).toBeLessThan(0.5);
  });
});

describe('reduce motion', () => {
  it('sets the end state without animating, and the end state is the same either way', () => {
    expect(dayNightMove(true, true)).toEqual({ to: 1, animate: false, duration: 0 });
    expect(dayNightMove(false, true)).toEqual({ to: 0, animate: false, duration: 0 });
    expect(dayNightMove(true, false)).toEqual({ to: 1, animate: true, duration: DAY_NIGHT_MS });
    expect(dayNightMove(false, false).to).toBe(dayNightMove(false, true).to);
  });

  it('is read from the theme, and sets the value — even over a flip already in flight', () => {
    expect(flat).toContain('dayNightMove(value, t.reduceMotion)');
    expect(flat).toContain('if (!move.animate) { progress.setValue(move.to);');
    expect(flat).toContain('[progress, value, t.reduceMotion]');
  });
});

describe('the component (tripwires over DayNightSwitch.tsx)', () => {
  it('is one switch to a screen reader: its role, its checked state, a label it cannot omit', () => {
    expect(flat).toContain('accessibilityRole="switch"');
    expect(flat).toContain('accessibilityState={{ checked: value, disabled }}');
    expect(flat).toContain('accessibilityLabel={accessibilityLabel}');
    // required in the props: the picture says nothing to a screen reader, so the name has to
    expect(flat).toContain('accessibilityLabel: string;');
    expect(flat).not.toContain('accessibilityLabel?: string');
  });

  it('flips on one press, and hides the picture from touch and from assistive technology', () => {
    // felt as a tick, then flipped: one press, one tick, one flip (the owner, 2026-09-25)
    expect(flat).toContain("onPress={() => { haptic('tick'); onValueChange(!value); }}");
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    // one Pressable, so one target and one focus stop
    expect(component.split('<Pressable')).toHaveLength(2);
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    // the interpolations feed nothing but opacity and transforms — a layout or color prop on the
    // native driver would throw, and on the JS driver would stutter
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'scaleX', 'scale', 'rotate'], prop).toContain(prop);
    expect(flat).toContain('easing: EASE');
    expect(flat).toContain('Easing.bezier(...DAY_NIGHT_EASE)');
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).not.toContain('reanimated');
  });

  it('writes no color: every fill is the sky’s or the theme’s', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
    expect(flat).toContain('const sky = dayNightSkyFor(t.theme);');
    expect(flat).toContain('borderColor: t.color.line2');
  });

  it('is exported with the design system’s other controls', () => {
    expect(read('core.ts')).toContain("export * from './DayNightSwitch';");
    expect(read('../index.ts')).toContain("export * from './theme/sky';");
  });
});

/**
 * THE CAPTION IN A CAPSULE (the owner, 2026-09-25: *"Highlight the text 'try me' like in a cpasule
 * shape"*). A filled pill from tokens only, in the pair a Badge's accent tone uses — so the words
 * are measured on the fill they actually sit on, in every theme and scheme, rather than trusted.
 */
describe('the caption is words in a capsule', () => {
  it('is a filled pill with room either side, inside the switch’s one target', () => {
    expect(flat).toContain("const capsule = badgeColors(t.color, 'accent');");
    expect(flat).toContain(
      'backgroundColor: capsule.fill, borderRadius: t.radius.pill, paddingHorizontal: t.space.md, paddingVertical: t.space.xs,',
    );
    expect(flat).toContain('<AppText variant="bodySm" color={capsule.ink}> {caption} </AppText>');
    // inside the Pressable, before the picture: tapping the words still flips the switch
    const press = flat.indexOf('<Pressable');
    const words = flat.indexOf('{caption ? (');
    const picture = flat.indexOf('pointerEvents="none"');
    expect(press).toBeGreaterThan(-1);
    expect(words).toBeGreaterThan(press);
    expect(picture).toBeGreaterThan(words);
  });

  it('reads at AA on its fill in light, dark and night, in every scheme, with no fallback', () => {
    for (const theme of themeNames)
      for (const scheme of Object.keys(schemes) as SchemeName[]) {
        const pair = badgeColors(resolvePalette(theme, scheme), 'accent');
        const at = `${theme}/${scheme}`;
        expect(contrastRatio(pair.ink, pair.fill), at).toBeGreaterThanOrEqual(AA_TEXT);
        // the gated pair itself, not the text ink standing in for it
        expect(pair.fellBack, at).toBe(false);
      }
  });
});
