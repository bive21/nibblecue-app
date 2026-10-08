/**
 * THE TICK THAT DRAWS ITSELF, AND THE SPARKLE ROUND THE LAST ONE (the owner, 2026-09-25, of the
 * "that's cool" list: *"Let's try doing everything. I will then review"*). Two halves, the way this
 * package tests anything that moves: the mark, the draw and the rays are PURE (`tickDraw.ts`) and
 * are sampled here the way the renderer and `Animated.Value#interpolate` would sample them; what
 * can only be seen on a device — that the mark is decoration inside a checkbox, honors reduce
 * motion and the amber night, and runs the rays on the native driver — is held by tripwires over
 * `TickMark.tsx` and `Row.tsx`, because this suite has no renderer (`interaction.test.ts` says why
 * that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '../icons/paths';
import { CUSTOM_ICON_PATHS } from '../icons/paths.custom';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, composite, contrastRatio } from '../theme/contrast';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { hit, moduleColor, space, themeNames, type Palette } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';
import {
  BURST_DELAY_MS,
  BURST_MS,
  burstFrames,
  DOT_END_SCALE,
  dotFrames,
  dotReach,
  DOTS,
  DOTS_DELAY_MS,
  DOTS_MS,
  motionStill,
  RAY_GAP,
  RAY_MIN_SCALE,
  rayReach,
  RAYS,
  TICK_DRAW_MS,
  TICK_EASE,
  TICK_GRID,
  TICK_POINTS,
  TICK_STROKE,
  TICK_UNDRAW_MS,
  tickDash,
  tickFrames,
  tickLength,
  tickPath,
} from './tickDraw';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('TickMark.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('tickDraw.ts'));

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped past the ends. */
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

/** A path of `M`/`m`/`L`/`l` commands as absolute points — enough for the icon set's `check`. */
function absolutePoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let at: [number, number] = [0, 0];
  for (const [, cmd = '', args = ''] of d.matchAll(/([MmLl])([^MmLl]*)/g)) {
    const nums = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const [x, y] = [nums[i] ?? 0, nums[i + 1] ?? 0];
      // a relative moveto's first pair is absolute when it opens the path, as SVG says
      const relative = cmd === cmd.toLowerCase() && out.length > 0;
      at = relative ? [at[0] + x, at[1] + y] : [x, y];
      out.push(at);
    }
  }
  return out;
}

/** The stretches of `[0, length]` a dash pattern at `offset` puts ink on. */
function inked(offset: number, length: number): [number, number][] {
  const { dasharray } = tickDash(length);
  const [dash, gap] = dasharray;
  const period = dash + gap;
  const out: [number, number][] = [];
  for (let k = -3; k <= 3; k += 1) {
    const start = k * period - offset;
    const end = start + dash;
    if (end >= 0 && start <= length) out.push([Math.max(0, start), Math.min(length, end)]);
  }
  return out;
}

const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);
const L = tickLength();
const DASH = tickDash();
const CAP = TICK_STROKE / 2;

describe('the mark is the glyph it replaces', () => {
  it('passes through paths.ts’s own check, point for point, at its stroke and on its grid', () => {
    const check = ICON_PATHS.check;
    expect(check.elements).toHaveLength(1);
    const [el] = check.elements;
    expect(el?.type).toBe('path');
    const pts = absolutePoints(el?.type === 'path' ? el.d : '');
    expect(pts).toHaveLength(TICK_POINTS.length);
    pts.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(TICK_POINTS[i]?.[0] ?? NaN, 9);
      expect(y).toBeCloseTo(TICK_POINTS[i]?.[1] ?? NaN, 9);
    });
    expect(check.strokeWidth).toBe(TICK_STROKE);
    expect(check.viewBox).toBe(`0 0 ${TICK_GRID} ${TICK_GRID}`);
  });

  it('is not replaced by the owner’s set — or the drawn tick would stop matching the drawn one', () => {
    // `Icon` reads the owner's kit first; a `check.svg` there would change the static tick and
    // leave this one behind. If the kit ever grows one, this file follows it (tools/ui/import-icons)
    expect(CUSTOM_ICON_PATHS.check).toBeUndefined();
  });

  it('is written in the order the pen draws it, and measures the two strokes end to end', () => {
    expect(tickPath()).toBe('M5 12.8L9.6 17.4L19 7');
    expect(L).toBeCloseTo(Math.hypot(4.6, 4.6) + Math.hypot(9.4, 10.4), 9);
  });
});

describe('the draw', () => {
  it('shows nothing before it starts — not a stroke, not a round cap’s dot at either end', () => {
    // every dash sits a whole cap clear of the path, so no renderer can round one onto it
    const [dash, gap] = DASH.dasharray;
    for (let k = -3; k <= 3; k += 1) {
      const start = k * (dash + gap) - DASH.from;
      const end = start + dash;
      expect(end <= -CAP + 1e-9 || start >= L + CAP - 1e-9, `dash ${k}`).toBe(true);
    }
    expect(inked(DASH.from, L)).toEqual([]);
  });

  it('shows the whole tick, as one stroke, when it ends', () => {
    expect(DASH.to).toBe(0);
    expect(inked(0, L)).toEqual([[0, L]]);
  });

  it('grows from the start of the tick to its tip, as a pen does — one stroke, never two', () => {
    const f = tickFrames(DASH);
    let before = 0;
    for (const p of STEPS) {
      const ink = inked(sample(f.offset, easeAt(TICK_EASE, p)), L);
      expect(ink.length, `at ${p}`).toBeLessThanOrEqual(1);
      const [from = 0, to = 0] = ink[0] ?? [];
      if (ink.length === 1) expect(from).toBe(0);
      const drawn = ink.length === 0 ? 0 : to - from;
      expect(drawn + 1e-9, `at ${p}`).toBeGreaterThanOrEqual(before);
      before = drawn;
    }
    expect(before).toBeCloseTo(L, 9);
  });

  it('puts the pen down at once: nothing waits longer than a tenth of the draw', () => {
    // the only dead time is the cap's width of gap the draw starts in
    const f = tickFrames(DASH);
    const first = STEPS.find(p => inked(sample(f.offset, p), L).length > 0) ?? 1;
    expect(first).toBeLessThan(0.1);
  });

  it('takes about 220 ms on a curve that never overshoots its tip', () => {
    expect(TICK_DRAW_MS).toBeGreaterThanOrEqual(180);
    expect(TICK_DRAW_MS).toBeLessThanOrEqual(260);
    // x control points inside [0, 1], or the curve is not a function of time
    expect(TICK_EASE[0]).toBeGreaterThanOrEqual(0);
    expect(TICK_EASE[2]).toBeLessThanOrEqual(1);
    let prev = 0;
    for (const p of STEPS) {
      const e = easeAt(TICK_EASE, p);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(e).toBeLessThanOrEqual(1 + 1e-9);
      prev = e;
    }
    expect(tickFrames(DASH).offset.extrapolate).toBe('clamp');
  });
});

describe('the sparkle', () => {
  const RINGS = [13, 14] as const;

  it('is a few short rays, gone in under half a second, starting as the stroke lands', () => {
    expect(RAYS.length).toBeGreaterThanOrEqual(4);
    expect(RAYS.length).toBeLessThanOrEqual(8);
    for (const r of RAYS) expect(r.length).toBeLessThanOrEqual(5);
    expect(BURST_MS).toBeLessThan(500);
    // it starts while the pen is still drawing, so it reads as the tick landing
    expect(BURST_DELAY_MS).toBeGreaterThan(0);
    expect(BURST_DELAY_MS).toBeLessThan(TICK_DRAW_MS);
    // and the whole flourish, stroke and rays, is over in about half a second
    expect(BURST_DELAY_MS + BURST_MS).toBeLessThanOrEqual(520);
  });

  it('points its rays every way round the circle, no two the same', () => {
    const angles = RAYS.map(r => ((r.angle % 360) + 360) % 360);
    expect(new Set(angles).size).toBe(RAYS.length);
    const sorted = [...angles].sort((a, b) => a - b);
    const gaps = sorted.map((a, i) => ((sorted[(i + 1) % sorted.length] ?? 0) - a + 360) % 360);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(90);
  });

  it('draws each ray out from the ring and in to its tip: never over the circle, never past its reach', () => {
    for (const ring of RINGS)
      for (const f of burstFrames(ring)) {
        for (const p of STEPS) {
          const x = sample(f.x, p);
          const half = (f.ray.length * sample(f.scale, p)) / 2;
          // the inner end never reaches back toward the circle past where the ray starts
          expect(x - half, `ray ${f.ray.angle} at ${p}`).toBeGreaterThanOrEqual(
            ring + RAY_GAP - 1e-9,
          );
          expect(x + half, `ray ${f.ray.angle} at ${p}`).toBeLessThanOrEqual(rayReach(ring) + 1e-9);
        }
        // it does reach out: fully drawn, it spans the whole of its length
        const out = f.x.inputRange[1] ?? 0;
        expect(sample(f.scale, out)).toBe(1);
      }
  });

  it('is invisible before it starts and after it ends, and whole in between', () => {
    for (const f of burstFrames(14)) {
      expect(sample(f.opacity, 0)).toBe(0);
      expect(sample(f.opacity, 1)).toBe(0);
      expect(Math.max(...STEPS.map(p => sample(f.opacity, p)))).toBe(1);
      // never scaled to exactly zero, which some platforms treat as a singular matrix
      expect(RAY_MIN_SCALE).toBeGreaterThan(0);
      expect(Math.min(...STEPS.map(p => sample(f.scale, p)))).toBe(RAY_MIN_SCALE);
    }
  });

  it('uses frames Animated can read: in order, inside the burst, one output per input, clamped', () => {
    for (const f of burstFrames(14))
      for (const fr of [f.x, f.scale, f.opacity]) {
        expect(fr.inputRange.length).toBe(fr.outputRange.length);
        for (let i = 1; i < fr.inputRange.length; i += 1)
          expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
        expect(fr.inputRange[0] ?? -1).toBeGreaterThanOrEqual(0);
        expect(fr.inputRange[fr.inputRange.length - 1] ?? 2).toBeLessThanOrEqual(1);
        expect(fr.extrapolate).toBe('clamp');
      }
  });

  it('fits the room the checklist Row has round its tick', () => {
    // Row.tsx: a 26 pt circle, `space.xl` in from the surface's edge, `space.lg` before the text,
    // in a row at least `hit.primary` tall with the circle in its middle
    const row = withoutComments(read('Row.tsx'));
    const tick = Number(/const TICK = (\d+);/.exec(row)?.[1]);
    expect(tick).toBe(26);
    expect(row).toContain('paddingHorizontal: t.space.xl');
    expect(row).toContain('minHeight: t.hit.primary');
    const ring = tick / 2;
    const room = Math.min(space.xl + ring, ring + space.lg, hit.primary / 2);
    expect(rayReach(ring)).toBeLessThanOrEqual(room);
  });
});

describe('the dots: the shopping list’s every other tick', () => {
  const RINGS = [13, 14] as const;

  it('are a tiny burst of five, round the circle, over as the stroke lands', () => {
    expect(DOTS.length).toBeGreaterThanOrEqual(4);
    expect(DOTS.length).toBeLessThanOrEqual(6);
    const angles = DOTS.map(d => ((d.angle % 360) + 360) % 360).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => ((angles[(i + 1) % angles.length] ?? 0) - a + 360) % 360);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(90);
    for (const d of DOTS) expect(d.size).toBeLessThanOrEqual(4);
    // they start as the pen turns the corner, and are gone within half a second of the tap
    expect(DOTS_DELAY_MS).toBeGreaterThan(0);
    expect(DOTS_DELAY_MS).toBeLessThan(TICK_DRAW_MS);
    expect(DOTS_DELAY_MS + DOTS_MS).toBeLessThanOrEqual(450);
  });

  it('never touch the circle, and go no further than the rays — the room the rows were measured for', () => {
    for (const ring of RINGS) {
      expect(dotReach(ring)).toBeLessThanOrEqual(rayReach(ring) + 1e-9);
      for (const f of dotFrames(ring))
        for (const p of STEPS) {
          const half = (f.dot.size * sample(f.scale, p)) / 2;
          expect(sample(f.x, p) - half, `dot ${f.dot.angle} at ${p}`).toBeGreaterThan(ring);
          expect(sample(f.x, p) + half, `dot ${f.dot.angle} at ${p}`).toBeLessThanOrEqual(
            dotReach(ring) + 1e-9,
          );
        }
    }
  });

  it('are unseen before they start and after they end, whole in between, and shrink as they go', () => {
    for (const f of dotFrames(14)) {
      expect(sample(f.opacity, 0)).toBe(0);
      expect(sample(f.opacity, 1)).toBe(0);
      expect(Math.max(...STEPS.map(p => sample(f.opacity, p)))).toBe(1);
      expect(sample(f.scale, 1)).toBe(DOT_END_SCALE);
      expect(DOT_END_SCALE).toBeGreaterThan(0);
      for (const fr of [f.x, f.scale, f.opacity]) expect(fr.extrapolate).toBe('clamp');
    }
  });

  it('runs the pen back quicker than it drew — taking a tick off is the smaller act', () => {
    expect(TICK_UNDRAW_MS).toBeLessThan(TICK_DRAW_MS);
    expect(TICK_UNDRAW_MS).toBeGreaterThanOrEqual(100);
  });
});

describe('when nothing moves', () => {
  it('is reduce motion, or the amber night — never light or dark on their own', () => {
    for (const theme of themeNames) {
      expect(motionStill(true, theme), `reduce motion, ${theme}`).toBe(true);
      expect(motionStill(false, theme), theme).toBe(theme === 'night');
    }
  });
});

/**
 * THE INKS, MEASURED (the batch's rule: every mark drawn is at least 3:1). The check is the ink on
 * the filled circle, as the glyph it replaces was; the rays are the accent on whatever the row sits
 * on — a card, the paper page, a row surface in any skin — measured over every scheme and theme.
 */
describe('the inks', () => {
  it('draws the check at 3:1 or better on the filled circle, in every scheme and theme', () => {
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        const at = `${scheme}/${theme}`;
        // the design system's Row inks it `onAccent`, the shopping list the derived one
        expect(contrastRatio(c.onAccent, c.accent), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
        expect(contrastRatio(deriveAccent(c).onAccent, c.accent), at).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
      }
  });

  it('throws the dots at 3:1 or better round a shopping line, in the thing’s own ink or the accent', () => {
    // a line is ticked in the list's card, or — ticked again while it is still held there after an
    // untick — in the basket's paper; its dots are its category's ink, the palette's own role (a
    // one-off's are the accent). Light and dark: the amber Night throws none.
    const roles = [...new Set(Object.values(moduleColor))];
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames.filter(x => x !== 'night')) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        const inks: [string, string][] = [
          ['accent', c.accent],
          ...roles.map(r => [r, (c as Palette)[r]] as [string, string]),
        ];
        for (const [name, ink] of inks)
          for (const [ground, bg] of [
            ['card', c.surfaceSolid],
            ['basket', c.paper],
          ] as const)
            expect(
              contrastRatio(ink, bg),
              `${scheme}/${theme}: ${name} dots on ${ground}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });

  it('draws the rays at 3:1 or better on every ground a checklist row sits on', () => {
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const s = r.skinTokens;
          const grounds: Record<string, string> = {
            // the shopping list's card, its basket's paper, the tasks' row surface over the page
            surfaceSolid: c.surfaceSolid,
            paper: c.paper,
            surfaceOnPaper: composite(c.paper, materialBase(c, s.surface), s.surface.alpha),
            surfaceOnApp: composite(c.app, materialBase(c, s.surface), s.surface.alpha),
            // and the wash under a line that is already on the list
            tintSoft: deriveAccent(c).tintSoft,
          };
          for (const [name, ground] of Object.entries(grounds))
            expect(
              contrastRatio(c.accent, ground),
              `${skin}/${scheme}/${theme}: accent on ${name}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
        }
  });
});

describe('the component (tripwires over TickMark.tsx)', () => {
  it('is decoration: hidden from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    // no control of its own: the checkbox around it is the control
    expect(component).not.toContain('<Pressable');
    expect(component).not.toContain('accessibilityRole');
  });

  it('reads reduce motion and the amber night from the theme, and draws the end state then', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // still: the plain path, whole, with no dash to animate
    expect(flat).toMatch(/\{still \? \( <Path d=\{D\}/);
    // and a change of either, mid-draw, lands on the end state rather than freezing
    expect(flat).toContain('if (!ticked || still) { draw.setValue(1);');
    expect(flat).toContain('[checked, still, draw]');
    // no ray and no dot is mounted while still
    expect(flat).toContain("bursting === 'rays' && !still && burstColor !== undefined");
    expect(flat).toContain("bursting === 'dots' && !still && dotColor !== undefined");
    // and an untick under either clears at once, with nothing run back
    expect(flat).toContain('if (!unticked || !runsBack.current || still) { draw.setValue(0);');
  });

  it('plays only a change it saw, and clears on untick — running back only when asked', () => {
    expect(flat).toContain('const ticked = checked && !was.current;');
    expect(flat).toContain('const unticked = !checked && was.current;');
    // the checklist asks for nothing, and its untick clears at once, as it always did
    expect(flat).toContain('undraw = false,');
    expect(flat).toContain('if (!checked) { setBursting(null);');
    // the shopping list's runs the stroke back and is drawn until it has gone
    expect(flat).toContain('setUndrawing(true); const back = pen(draw, 0);');
    expect(flat).toContain('{checked || undrawing ? (');
    // constructed at the resting value, so a tick that arrives ticked is simply drawn
    expect(flat).toContain('new Animated.Value(checked ? 1 : 0)');
  });

  it('reads the caller’s burst and dots when the tick is made, never as a reason to restart', () => {
    expect(flat).toContain(
      "if (wantsBurst.current) setBursting('rays'); else if (wantsDots.current) setBursting('dots');",
    );
    expect(flat).not.toMatch(/\[checked, still, draw, burst/);
    // the rays win: one sparkle per tick, never both
    expect(flat.indexOf("setBursting('rays')")).toBeLessThan(flat.indexOf("setBursting('dots')"));
  });

  it('draws with one JS-driven dash offset, and runs the sparkles on the native driver', () => {
    // exactly one of each: the draw (a path prop) and the sparkle (styles)
    expect(flat.match(/useNativeDriver: false/g) ?? []).toHaveLength(1);
    expect(flat.match(/useNativeDriver: true/g) ?? []).toHaveLength(1);
    expect(flat).toContain('strokeDashoffset={offset}');
    expect(flat).toContain('Animated.createAnimatedComponent(Path)');
    // the rays and the dots are fed opacity and transforms and nothing else
    const fed = [...flat.matchAll(/(\w+): num\(pop,/g)].map(m => m[1]);
    expect(fed.sort()).toEqual([
      'opacity',
      'opacity',
      'scale',
      'scaleX',
      'translateX',
      'translateX',
    ]);
    expect(flat).toContain('{ rotate: `${f.ray.angle}deg` }');
    expect(flat).toContain('{ rotate: `${f.dot.angle}deg` }');
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).not.toContain('reanimated');
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });

  it('is exported with the controls, and its arithmetic through the node-safe entry', () => {
    expect(read('core.ts')).toContain("export * from './TickMark';");
    expect(read('core.ts')).not.toContain("'./tickDraw'");
    expect(read('../layout.ts')).toContain("from './components/tickDraw';");
  });
});

describe('the checklist Row draws it', () => {
  const row = withoutComments(read('Row.tsx')).replace(/\s+/g, ' ');

  it('puts the mark in the tick’s own control, where the static check was', () => {
    expect(row).toContain(
      '<TickMark checked={checked} size={15} color={t.color.onAccent} ring={TICK / 2} burst={checkBurst} burstColor={t.color.accent} />',
    );
    expect(row).not.toContain('<Icon name="check" size={15} color={t.color.onAccent} />');
    // still the checkbox it was: the role, the state, the label, the id
    expect(row).toContain(
      'accessibilityRole="checkbox" accessibilityState={{ checked, disabled }}',
    );
    expect(row).toContain('testID={testID === undefined ? undefined : `${testID}.tick`}');
  });

  it('only sparkles when the caller says so', () => {
    expect(row).toContain('checkBurst = false,');
    expect(row).toContain('checkBurst?: boolean;');
  });
});
