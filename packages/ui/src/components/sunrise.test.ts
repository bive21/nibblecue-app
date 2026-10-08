/**
 * THE SUN COMES UP OVER THE WELCOME (the owner, 2026-09-26, of setup's animations). The picture's
 * geometry at both ends of the rise, the rays opening from their inner ends, the timing and the ink
 * are PURE (`sunrise.ts`) and proved here; that it rises once and never again, rests risen under
 * reduce motion and in the amber Night, and is decoration to everything but the eye is held by
 * tripwires over `Sunrise.tsx` — and that `StepHeader` puts it where the eyebrow glyph was, by one
 * over `StepHeader.tsx` (no renderer here — `interaction.test.ts` says why).
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
import { AA_GRAPHIC, contrastRatio } from '../theme/contrast';
import { groundComposites, patternComposites } from '../theme/ground';
import { SKIN_NAMES } from '../theme/skins';
import { themeNames } from '../theme/theme';
import { sampleFrame } from './keyframes';
import {
  HORIZON,
  RAY,
  RAY_ANGLES,
  RISE_FROM,
  SKY_FLOOR,
  SUN,
  SUNRISE_BOX,
  SUNRISE_MS,
  SUNRISE_TIMING,
  sunriseFrames,
} from './sunrise';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);
const f = sunriseFrames();

/** Where a ray's two ends are, from the sun's center, at clock `t` (the ray lies along its angle). */
function rayEnds(i: number, t: number): { inner: number; outer: number } {
  const r = f.rays[i];
  if (r === undefined) throw new Error(`no ray ${i}`);
  const x = sampleFrame(r.x, t);
  const half = (RAY.length * sampleFrame(r.scale, t)) / 2;
  return { inner: x - half, outer: x + half };
}

describe('the picture at rest, which is also what reduce motion and Night draw', () => {
  it('is the app’s own sun: a ring and eight rays, all inside the box and above the horizon', () => {
    expect(RAY_ANGLES).toHaveLength(8);
    const reach = RAY.from + RAY.length + RAY.thick / 2;
    expect(SUN.cx - reach).toBeGreaterThanOrEqual(0);
    expect(SUN.cx + reach).toBeLessThanOrEqual(SUNRISE_BOX.width);
    expect(SUN.cy - reach).toBeGreaterThanOrEqual(0);
    // the lowest ray ends above the horizon's top: nothing of the risen sun is clipped
    expect(SUN.cy + reach).toBeLessThanOrEqual(SKY_FLOOR);
    // and the rays stand clear of the ring, as the glyph's do
    expect(RAY.from - RAY.thick / 2).toBeGreaterThan(SUN.r + SUN.stroke / 2);
  });

  it('draws the horizon inside the box, under the sun', () => {
    expect(HORIZON.y + HORIZON.thick / 2).toBeLessThanOrEqual(SUNRISE_BOX.height);
    expect(HORIZON.inset).toBeGreaterThan(0);
    expect(SKY_FLOOR).toBe(HORIZON.y - HORIZON.thick / 2);
  });

  it('has every part at rest at the end of the clock', () => {
    expect(sampleFrame(f.horizon, 1)).toBe(1);
    expect(sampleFrame(f.rise, 1)).toBe(0);
    for (const r of f.rays) {
      expect(sampleFrame(r.scale, 1)).toBe(1);
      expect(sampleFrame(r.opacity, 1)).toBe(1);
      expect(sampleFrame(r.x, 1)).toBeCloseTo(RAY.from + RAY.length / 2, 9);
    }
  });
});

describe('the sunrise', () => {
  it('starts with the sun wholly behind the horizon, no rays, and the horizon a point', () => {
    const top = SUN.cy + sampleFrame(f.rise, 0) - SUN.r - SUN.stroke / 2;
    expect(sampleFrame(f.rise, 0)).toBe(RISE_FROM);
    expect(top).toBeGreaterThanOrEqual(SKY_FLOOR);
    for (const r of f.rays) expect(sampleFrame(r.opacity, 0)).toBe(0);
    expect(sampleFrame(f.horizon, 0)).toBeLessThan(0.05);
  });

  it('rises one way, never dipping back', () => {
    let before = Infinity;
    for (const t of STEPS) {
      const drop = sampleFrame(f.rise, t);
      expect(drop).toBeLessThanOrEqual(before + 1e-9);
      before = drop;
    }
  });

  it('opens each ray from its inner end, which stays where it starts, clockwise from the top', () => {
    for (let i = 0; i < f.rays.length; i += 1) {
      for (const t of STEPS) {
        const { inner, outer } = rayEnds(i, t);
        expect(inner).toBeCloseTo(RAY.from, 6);
        expect(outer).toBeLessThanOrEqual(RAY.from + RAY.length + 1e-9);
      }
    }
    expect(RAY_ANGLES[0]).toBe(-90);
    for (let i = 1; i < RAY_ANGLES.length; i += 1)
      expect(RAY_ANGLES[i] ?? 0).toBeGreaterThan(RAY_ANGLES[i - 1] ?? 0);
  });

  it('never opens a ray where the horizon would cut it: every tip stays in the sky, all the way', () => {
    // walked through every ray's whole opening, on the sun as it stands at each moment — a ray that
    // points down is opened only once the sun is high enough to hold it
    for (let i = 0; i < f.rays.length; i += 1) {
      const angle = ((RAY_ANGLES[i] ?? 0) * Math.PI) / 180;
      for (const t of STEPS) {
        if (sampleFrame(f.rays[i]?.opacity ?? f.horizon, t) <= 0) continue;
        const { outer } = rayEnds(i, t);
        const tip = SUN.cy + sampleFrame(f.rise, t) + Math.sin(angle) * outer + RAY.thick / 2;
        expect(tip, `ray ${RAY_ANGLES[i]} at ${t}`).toBeLessThanOrEqual(SKY_FLOOR + 1e-9);
      }
    }
    expect(SUNRISE_TIMING.raysAt).toBeGreaterThan(SUNRISE_TIMING.riseAt);
  });

  it('is a calm one-time entrance: over in well under a second and a quarter', () => {
    expect(SUNRISE_MS).toBeLessThanOrEqual(1200);
    const s = SUNRISE_TIMING;
    expect(s.riseAt + s.riseMs).toBeLessThanOrEqual(SUNRISE_MS);
    expect(s.horizonMs).toBeLessThanOrEqual(s.riseAt + s.riseMs);
  });
});

/**
 * THE INK, MEASURED: `accent2`, the eyebrow glyph's own ink, as a graphic (3:1) on every ground the
 * welcome can be drawn on — the paper page, the doodle pattern over it, and the lit ground a Glass
 * household gets — in every skin, scheme and theme, the amber Night included (drawn still, in the
 * night's own `accent2`).
 */
describe('the ink', () => {
  it('is 3:1 or better on every ground the welcome can sit on', () => {
    const failures: string[] = [];
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const grounds: Record<string, string> = { paper: c.paper, app: c.app, page: c.page };
          Object.assign(grounds, patternComposites(c, r.skinTokens, theme) ?? {});
          Object.assign(grounds, groundComposites(c, r.skinTokens) ?? {});
          for (const [name, g] of Object.entries(grounds)) {
            const v = contrastRatio(c.accent2, g);
            if (v < AA_GRAPHIC)
              failures.push(`${skin}/${scheme}/${theme}: accent2 on ${name} = ${v.toFixed(2)}`);
          }
        }
    expect(failures).toEqual([]);
  });
});

describe('the component (tripwires over Sunrise.tsx)', () => {
  const src = withoutComments(read('Sunrise.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('rises once, on its first frame, and never again', () => {
    expect(flat).toContain('const played = useRef(false);');
    expect(flat).toContain(
      'if (played.current || still) { played.current = true; clock.setValue(1);',
    );
    expect(flat).toContain('run.stop(); clock.setValue(1);');
  });

  it('is risen and still under reduce motion and in the amber Night, in the theme’s own ink', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('new Animated.Value(still ? 1 : 0)');
    expect(flat).toContain('const ink = t.color.accent2;');
  });

  it('is decoration: no touch, no name, hidden from a screen reader', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(src).not.toMatch(/accessibilityLabel|accessibilityRole|onPress|<Pressable/);
  });

  it('moves by transforms and opacity of one clock on the native driver, the sky clipped at the horizon', () => {
    expect(flat.match(/useNativeDriver: true/g) ?? []).toHaveLength(1);
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).toContain("sky: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' }");
    expect(flat).toContain('height: SKY_FLOOR');
  });

  it('writes no color of its own', () => {
    for (const s of [src, withoutComments(read('sunrise.ts'))]) {
      expect(s).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(s).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });
});

describe('StepHeader puts the picture where the eyebrow’s glyph was', () => {
  const header = withoutComments(read('StepHeader.tsx')).replace(/\s+/g, ' ');

  it('draws the art above the eyebrow word, and leaves the small glyph out when it does', () => {
    expect(header).toContain('{art ?? null}');
    expect(header.indexOf('{art ?? null}')).toBeLessThan(header.indexOf('<Label style='));
    expect(header).toContain(
      '{art === undefined ? <Icon name={icon} size={18} color={t.color.accent2} /> : null}',
    );
  });
});
