/**
 * THE HIDDEN CREDITS AS NUMBERS (`starfield.ts`; the owner, 2026-09-25): seven taps within two
 * seconds of each other open them, and the sky they open onto loops without a seam. The colors
 * and the words over them are measured in `theme/starfield.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countTap,
  driftFrames,
  EGG_FELT_FROM,
  EGG_IDLE_MS,
  EGG_TAPS,
  starfield,
  STARFIELD_LAYERS,
  tapFeel,
  type TapRun,
} from './starfield';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

/** Taps at the given times, in order: what each one returned. */
function tapAt(times: readonly number[]) {
  let run: TapRun | null = null;
  return times.map(now => {
    const r = countTap(run, now);
    run = r.run;
    return r;
  });
}

describe('seven taps open it', () => {
  it('fires on the seventh tap in a row, and not before', () => {
    const results = tapAt([0, 300, 600, 900, 1200, 1500, 1800]);
    expect(results.map(r => r.count)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(results.map(r => r.fired)).toEqual([false, false, false, false, false, false, true]);
    expect(EGG_TAPS).toBe(7);
  });

  it('starts again after a pause longer than two seconds', () => {
    const results = tapAt([0, 500, 1000, 1000 + EGG_IDLE_MS + 1, 3600, 3900, 4200, 4500, 4800]);
    expect(results.map(r => r.count)).toEqual([1, 2, 3, 1, 2, 3, 4, 5, 6]);
    expect(results.some(r => r.fired)).toBe(false);
  });

  it('counts a tap exactly two seconds after the last as the same run — the edge is inclusive', () => {
    const results = tapAt([0, EGG_IDLE_MS]);
    expect(results[1]?.count).toBe(2);
  });

  it('forgets the run once it has fired, so the next tap is a first tap', () => {
    const results = tapAt([0, 100, 200, 300, 400, 500, 600, 700]);
    expect(results[6]?.fired).toBe(true);
    expect(results[6]?.run).toBeNull();
    expect(results[7]?.count).toBe(1);
  });

  it('starts again when the clock goes backwards, rather than counting on', () => {
    const results = tapAt([5000, 5200, 4000]);
    expect(results.map(r => r.count)).toEqual([1, 2, 1]);
  });

  it('is felt from the fourth tap, and the seventh is the arrival', () => {
    const results = tapAt([0, 100, 200, 300, 400, 500, 600]);
    expect(results.map(tapFeel)).toEqual([null, null, null, 'tick', 'tick', 'tick', 'success']);
    expect(EGG_FELT_FROM).toBeGreaterThan(1);
    expect(EGG_FELT_FROM).toBeLessThan(EGG_TAPS);
  });
});

describe('the sky it opens onto', () => {
  it('draws the same stars every time, on the same phone', () => {
    expect(starfield(390, 844)).toEqual(starfield(390, 844));
  });

  it('keeps every star whole inside the screen across, and on it down', () => {
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [430, 932],
      [1024, 768],
    ] as const) {
      for (const layer of starfield(w, h))
        for (const s of layer.stars) {
          expect(s.x - s.size / 2).toBeGreaterThanOrEqual(0);
          expect(s.x + s.size / 2).toBeLessThanOrEqual(w);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(h);
          expect(s.alpha).toBeGreaterThan(0);
          expect(s.alpha).toBeLessThanOrEqual(1);
        }
    }
  });

  it('is many faint far stars, fewer nearer, and a handful of near sparkles', () => {
    const [far, mid, near] = starfield(390, 844);
    expect(far?.stars.length).toBeGreaterThan(mid?.stars.length ?? Infinity);
    expect(mid?.stars.length).toBeGreaterThan(near?.stars.length ?? Infinity);
    expect(near?.kind).toBe('sparkle');
    expect(near?.stars.length).toBeLessThanOrEqual(8);
  });

  it('gives a bigger screen more stars, never a phone’s sky with gaps in it', () => {
    const phone = starfield(390, 844).reduce((n, l) => n + l.stars.length, 0);
    const tablet = starfield(1024, 1366).reduce((n, l) => n + l.stars.length, 0);
    expect(tablet).toBeGreaterThan(phone * 2);
  });

  it('drifts nearer layers faster, and all of them slowly: a screen takes over a minute', () => {
    const periods = STARFIELD_LAYERS.map(l => l.periodMs);
    expect([...periods].sort((a, b) => b - a)).toEqual(periods);
    for (const p of periods) expect(p).toBeGreaterThanOrEqual(60_000);
  });

  it('moves a layer up by exactly one screen per loop, so the loop has no seam', () => {
    expect(driftFrames(844)).toEqual({ inputRange: [0, 1], outputRange: [0, -844] });
  });

  it('draws nothing before there is a screen', () => {
    for (const layer of starfield(0, 0)) expect(layer.stars).toEqual([]);
  });
});

/* -------------------------------------------------------------------- the component */

const component = read('StarfieldCredits.tsx');
const flat = component
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('the component (tripwires over StarfieldCredits.tsx)', () => {
  it('is one button whose name is the credits, and a tap anywhere or Back closes it', () => {
    expect(flat).toContain('accessibilityRole="button"');
    expect(flat).toContain("accessibilityLabel={[title, ...lines].join('. ')}");
    expect(flat).toContain('accessibilityHint={accessibilityHint}');
    expect(flat).toContain('onPress={onClose}');
    expect(flat).toContain('onRequestClose={onClose}');
    expect(component.split('<Pressable')).toHaveLength(2);
  });

  it('keeps the sky out of touch and out of the screen reader', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('drifts on the native driver with a transform, and holds still for reduce motion and amber Night', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).toContain("const still = t.reduceMotion || t.theme === 'night';");
    expect(flat).toContain('if (!visible || still) {');
    expect(flat).toContain("animationType={still ? 'none' : 'fade'}");
    expect(flat).toContain('translateY:');
  });

  it('draws the theme’s starfield and writes no color and no word of its own', () => {
    expect(flat).toContain('starfieldFor(t.theme)');
    expect(flat).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(flat).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    expect(flat).not.toMatch(/['"`](Made by|Thank|Tap)[^'"`]*['"`]/);
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });

  it('is exported with the design system’s components, its tap counting with it', () => {
    expect(read('core.ts')).toContain("export * from './StarfieldCredits';");
    // `EGG_TAPS` and `TapResult` left this line on 2026-09-26: nothing imported them through the
    // barrel
    expect(flat).toContain("export { countTap, tapFeel, type TapRun } from './starfield';");
  });
});
