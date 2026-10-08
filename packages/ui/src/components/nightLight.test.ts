/**
 * THE NIGHT LIGHT AS NUMBERS (`nightLight.ts`; the owner, 2026-09-25): the clamp, the drag, the
 * three things a lift of the finger can mean, the accessibility step, and a light that never
 * reaches the words at its foot. The colors are measured in `theme/nightLight.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { space } from '../theme/theme';
import {
  CLOSE_SWIPE,
  clampLevel,
  DRAG_SPAN,
  endReached,
  GLOW_STOPS,
  HINT_BAND,
  levelAfterDrag,
  levelPercent,
  NIGHT_LIGHT_LEVEL,
  nightLightGeometry,
  releaseOf,
  stepLevel,
  TAP_MS,
  TAP_SLOP,
} from './nightLight';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

describe('the level is clamped', () => {
  it('holds every number to the range, and a nonsense one to where a new light starts', () => {
    expect(clampLevel(-0.5)).toBe(0);
    expect(clampLevel(0.25)).toBe(0.25);
    expect(clampLevel(1.7)).toBe(1);
    expect(clampLevel(Number.NaN)).toBe(NIGHT_LIGHT_LEVEL.start);
    expect(clampLevel(Number.POSITIVE_INFINITY)).toBe(NIGHT_LIGHT_LEVEL.start);
  });

  it('starts a new light dim, well below half', () => {
    expect(NIGHT_LIGHT_LEVEL.start).toBeGreaterThan(NIGHT_LIGHT_LEVEL.min);
    expect(NIGHT_LIGHT_LEVEL.start).toBeLessThan(0.5);
  });

  it('says the level in whole percent', () => {
    expect(levelPercent(0.404)).toBe(40);
    expect(levelPercent(2)).toBe(100);
    expect(levelPercent(-1)).toBe(0);
  });
});

describe('a drag sets it', () => {
  const H = 844;

  it('brightens going up and dims going down', () => {
    expect(levelAfterDrag(0.4, -100, H)).toBeGreaterThan(0.4);
    expect(levelAfterDrag(0.4, 100, H)).toBeLessThan(0.4);
    expect(levelAfterDrag(0.4, 0, H)).toBe(0.4);
  });

  it('runs the whole range over DRAG_SPAN of the screen, and no further', () => {
    expect(levelAfterDrag(0, -H * DRAG_SPAN, H)).toBeCloseTo(1, 9);
    expect(levelAfterDrag(1, H * DRAG_SPAN, H)).toBeCloseTo(0, 9);
    expect(levelAfterDrag(0.5, -H * 5, H)).toBe(1);
    expect(levelAfterDrag(0.5, H * 5, H)).toBe(0);
    expect(DRAG_SPAN).toBeLessThan(1);
  });

  it('measures from where the finger went down, so a drag can be walked back', () => {
    const there = levelAfterDrag(0.4, -120, H);
    expect(levelAfterDrag(0.4, -120 + 120, H)).toBe(0.4);
    expect(there).not.toBe(0.4);
  });

  it('holds still on a screen with no height yet', () => {
    expect(levelAfterDrag(0.3, -500, 0)).toBe(0.3);
  });

  it('ticks once as it arrives at an end, and not again while it stays there', () => {
    expect(endReached(0.1, 0)).toBe('min');
    expect(endReached(0, 0)).toBeNull();
    expect(endReached(0.9, 1)).toBe('max');
    expect(endReached(1, 1)).toBeNull();
    expect(endReached(0.4, 0.5)).toBeNull();
  });
});

describe('what a lift of the finger meant', () => {
  it('a touch that barely moved and did not linger is a tap, and closes it', () => {
    expect(releaseOf({ dx: 2, dy: -3, vy: 0, ms: 120 })).toBe('tap');
    expect(releaseOf({ dx: TAP_SLOP - 1, dy: 0, vy: 0, ms: TAP_MS - 1 })).toBe('tap');
  });

  it('a thumb resting on the glass is not a tap', () => {
    expect(releaseOf({ dx: 1, dy: 1, vy: 0, ms: 900 })).toBe('adjust');
  });

  it('a quick swipe down closes it; the same distance slowly is a dimming', () => {
    expect(releaseOf({ dx: 4, dy: 140, vy: 1.4, ms: 150 })).toBe('close');
    expect(releaseOf({ dx: 4, dy: 140, vy: 0.2, ms: 900 })).toBe('adjust');
    expect(releaseOf({ dx: 0, dy: CLOSE_SWIPE.distance, vy: CLOSE_SWIPE.velocity, ms: 100 })).toBe(
      'close',
    );
  });

  it('a fling that is mostly sideways, or upward, never closes it', () => {
    expect(releaseOf({ dx: 160, dy: 90, vy: 1.4, ms: 150 })).toBe('adjust');
    expect(releaseOf({ dx: 0, dy: -140, vy: -1.4, ms: 150 })).toBe('adjust');
  });
});

describe('the accessibility step', () => {
  it('moves a tenth at a time and lands on the tenths', () => {
    expect(stepLevel(0.4, 1)).toBeCloseTo(0.5, 9);
    expect(stepLevel(0.43, 1)).toBeCloseTo(0.5, 9);
    expect(stepLevel(0.4, -1)).toBeCloseTo(0.3, 9);
  });

  it('stops at both ends', () => {
    expect(stepLevel(1, 1)).toBe(1);
    expect(stepLevel(0, -1)).toBe(0);
  });
});

describe('where the light sits', () => {
  // phones portrait at their real insets, a tablet both ways, and a very short screen
  const SCREENS: [number, number, number][] = [
    [320, 568, 0],
    [375, 667, 0],
    [390, 844, 34],
    [430, 932, 34],
    [360, 780, 24],
    [768, 1024, 20],
    [1024, 768, 20],
    [390, 400, 0],
  ];

  it('never reaches the line of words at the foot, so they are always on the bare ground', () => {
    for (const [w, h, inset] of SCREENS) {
      const g = nightLightGeometry(w, h, inset);
      expect(g.cy + g.brightR, `${w}×${h}`).toBeLessThanOrEqual(g.hintTop);
      expect(g.dimR).toBeLessThanOrEqual(g.brightR);
      expect(g.hintBottom).toBe(inset + space.xxl);
      expect(g.hintTop).toBe(h - inset - space.xxl - HINT_BAND);
    }
  });

  it('is a real light on every phone: most of the screen’s width across', () => {
    for (const [w, h, inset] of SCREENS.slice(0, 5)) {
      const g = nightLightGeometry(w, h, inset);
      expect(g.brightR * 2, `${w}×${h}`).toBeGreaterThan(w * 0.9);
    }
  });

  it('sits a little above the middle, centered across', () => {
    const g = nightLightGeometry(390, 844, 34);
    expect(g.cx).toBe(195);
    expect(g.cy).toBeLessThan(844 / 2);
  });

  it('fades from its heart to nothing, in order', () => {
    const offsets = GLOW_STOPS.map(s => s.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(GLOW_STOPS[0]).toMatchObject({ offset: 0, at: 'core', opacity: 1 });
    expect(GLOW_STOPS[GLOW_STOPS.length - 1]).toMatchObject({ offset: 1, opacity: 0 });
    for (let i = 1; i < GLOW_STOPS.length; i += 1)
      expect(GLOW_STOPS[i]!.opacity).toBeLessThanOrEqual(GLOW_STOPS[i - 1]!.opacity);
  });
});

/* -------------------------------------------------------------------- the component */

const component = read('NightLight.tsx');
const flat = component
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('the component (tripwires over NightLight.tsx)', () => {
  it('is one adjustable element with a name, a value, a hint, and ways to close', () => {
    expect(flat).toContain('accessibilityRole="adjustable"');
    expect(flat).toContain('accessibilityLabel={label}');
    // a screen reader's hint of its own: "drag" and "tap" are a finger's words, not VoiceOver's
    expect(flat).toContain('accessibilityHint={accessibilityHint}');
    expect(flat).toContain(
      'accessibilityValue={{ min: 0, max: 100, now: percent, text: valueText(percent) }}',
    );
    for (const action of ['increment', 'decrement', 'activate', 'escape'])
      expect(flat).toContain(`{ name: '${action}' }`);
    expect(flat).toContain('onAccessibilityEscape={onClose}');
  });

  it('sets the glow’s opacity from the finger — opacity only, and nothing that animates by itself', () => {
    expect(flat).toContain('{ opacity: bright }');
    expect(flat).toContain('bright.setValue(next)');
    expect(flat).not.toContain('Animated.loop');
    expect(flat).not.toContain('Animated.timing');
    expect(flat).not.toMatch(/transform:/);
  });

  it('closes at the level it was opened at, and keeps an adjustment', () => {
    expect(flat).toContain("if (lift === 'adjust') { settle(shown.current); return; }");
    expect(flat).toContain('bright.setValue(from.current); latest.current.onClose();');
  });

  it('ticks at the ends through the design system’s haptic call, and nowhere else', () => {
    expect(flat).toContain("import { haptic } from '../feedback/haptics';");
    expect(flat.match(/haptic\('/g)).toHaveLength(1);
    expect(flat).toContain("if (endReached(shown.current, next) !== null) haptic('tick');");
  });

  it('keeps the words at two lines and the chrome cap, the room HINT_BAND leaves them', () => {
    expect(flat).toContain('numberOfLines={2}');
    expect(flat).toContain('maxFontSizeMultiplier={CHROME_FONT_CAP}');
  });

  it('draws the theme’s light and writes no color and no word of its own', () => {
    expect(flat).toContain('nightLightFor(t.theme)');
    expect(flat).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(flat).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    expect(flat).not.toMatch(/['"`](Night light|Close|Tap|Drag)[^'"`]*['"`]/);
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    // the phone's own backlight is a native module this over-the-air update may not add
    expect(flat).not.toContain('expo-brightness');
  });

  it('is exported with the design system’s components, and its clamp for node too', () => {
    expect(read('core.ts')).toContain("export * from './NightLight';");
    expect(read('../layout.ts')).toContain(
      "export { clampLevel, NIGHT_LIGHT_LEVEL } from './components/nightLight';",
    );
  });
});
