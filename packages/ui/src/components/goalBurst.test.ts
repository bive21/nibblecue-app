/**
 * A DAILY GOAL REACHED (`goalBurst.ts`, `GoalBar.tsx`; the owner, 2026-09-26: *"when goal is
 * achieved, make it more celebratory"*). The moment's frames and places are numbers a node test
 * reads; its colors are measured over every theme and scheme; the component is held to its rules by
 * its source, the way this package tests what it cannot render.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import {
  GOAL_BURST,
  GOAL_BURST_MS,
  GOAL_MARK,
  GOAL_SPARK_REACH,
  GOAL_SPARKS,
  goalBurstFrames,
} from './goalBurst';
import { sampleFrame } from './keyframes';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** `ProgressLine`'s own height, read from its source: the .tsx does not load in node. */
const PROGRESS_LINE_HEIGHT = Number(
  /export const PROGRESS_LINE_HEIGHT = (\d+);/.exec(read('ProgressLine.tsx'))?.[1],
);
const at = (ms: number) => ms / GOAL_BURST_MS;

describe('the moment', () => {
  it('fills the bar from where the day stood, and ends full', () => {
    const f = goalBurstFrames(0.8);
    expect(sampleFrame(f.fill, 0)).toBeCloseTo(0.8, 5);
    expect(sampleFrame(f.fill, at(GOAL_BURST.fill[1]))).toBeCloseTo(1, 5);
    expect(sampleFrame(f.fill, 1)).toBeCloseTo(1, 5);
    // never backwards, whatever the caller hands in
    expect(sampleFrame(goalBurstFrames(-3).fill, 0)).toBe(0);
    expect(sampleFrame(goalBurstFrames(Number.NaN).fill, 0)).toBe(0);
    expect(sampleFrame(goalBurstFrames(7).fill, 0)).toBe(1);
    let last = 0;
    for (let ms = 0; ms <= GOAL_BURST_MS; ms += 20) {
      const w = sampleFrame(goalBurstFrames(0).fill, at(ms));
      expect(w).toBeGreaterThanOrEqual(last - 1e-9);
      last = w;
    }
  });

  it('pops the mark from nothing, past full, and settles it — after the fill has nearly landed', () => {
    const f = goalBurstFrames(0.5);
    expect(sampleFrame(f.mark, 0)).toBe(0);
    expect(sampleFrame(f.mark, at(GOAL_BURST.mark[0]))).toBe(0);
    expect(Math.max(...f.mark.outputRange)).toBeCloseTo(1.35, 5);
    expect(sampleFrame(f.mark, 1)).toBe(1);
    expect(GOAL_BURST.mark[0]).toBeLessThan(GOAL_BURST.fill[1]);
  });

  it('throws a few sparkles that are all gone by the end', () => {
    const f = goalBurstFrames(0.5);
    expect(f.sparks).toHaveLength(GOAL_SPARKS.length);
    expect(GOAL_SPARKS.length).toBeLessThanOrEqual(6);
    for (const s of f.sparks) {
      expect(sampleFrame(s.opacity, 0)).toBe(0);
      expect(sampleFrame(s.opacity, 1)).toBe(0);
      expect(Math.max(...s.opacity.outputRange)).toBe(1);
    }
  });

  it('keeps every sparkle up and away from the bar, inside its reach and never past the end', () => {
    for (const s of GOAL_SPARKS) {
      expect(Math.hypot(s.dx, s.dy)).toBeLessThanOrEqual(GOAL_SPARK_REACH);
      // up, never down into whatever is under the bar
      expect(s.dy).toBeLessThan(0);
      // the mark is on the bar's right end: nothing flies more than a few points past it
      expect(s.dx + s.size / 2).toBeLessThanOrEqual(GOAL_MARK / 2);
    }
  });

  it('brings the words up into place, and they stay', () => {
    const f = goalBurstFrames(0.5);
    expect(sampleFrame(f.words.opacity, at(GOAL_BURST.words[0]))).toBe(0);
    expect(sampleFrame(f.words.opacity, 1)).toBe(1);
    expect(sampleFrame(f.words.y, 1)).toBe(0);
  });

  it('is over in about a second, every part inside the clock', () => {
    expect(GOAL_BURST_MS).toBeLessThanOrEqual(1200);
    for (const [a, b] of Object.values(GOAL_BURST)) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(GOAL_BURST_MS);
      expect(b).toBeGreaterThan(a);
    }
  });

  it('draws the mark on the bar’s end, reaching only a little past the line’s height', () => {
    expect(GOAL_MARK).toBeGreaterThan(PROGRESS_LINE_HEIGHT);
    expect((GOAL_MARK - PROGRESS_LINE_HEIGHT) / 2).toBeLessThanOrEqual(4);
  });
});

/**
 * THE COLORS, MEASURED. The fill, the mark's disc and the sparkles are the tummy-time module's own
 * ink, and the check in the disc is the card's solid ground. A graphic, so 3:1: the check on the
 * disc, and the disc and a sparkle on the surfaces a goal is drawn on — in every theme, the amber
 * Night included, and every scheme.
 */
describe('the tummy-time goal’s mark and sparkles, measured', () => {
  const SCHEMES = Object.keys(schemes) as SchemeName[];
  const cases = themeNames.flatMap(theme =>
    SCHEMES.map(scheme => ({ at: `${theme}/${scheme}`, p: resolvePalette(theme, scheme) })),
  );

  it('reads at 3:1: the check on the disc, the disc and the sparkles on the card', () => {
    expect(cases).toHaveLength(themeNames.length * SCHEMES.length);
    for (const { at: where, p } of cases) {
      expect(contrastRatio(p.surfaceSolid, p.tummy), `${where} check`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      for (const ground of [p.surfaceSolid, p.surface2, p.paper])
        expect(contrastRatio(p.tummy, ground), `${where} on ${ground}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
    }
  });
});

describe('the component', () => {
  const src = read('GoalBar.tsx');

  it('is the progress line at rest, with the mark and the words once the goal is reached', () => {
    expect(src).toContain('<ProgressLine value={moving ? 0 : value} color={color}');
    expect(src).toContain('{reached ? (');
    expect(src).toContain('{words !== undefined && reached ? (');
  });

  it('plays a moment once, never one already over, and never under reduce motion or in Night', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(src).toContain('if (moment === null || moment.id === played.current) return;');
    expect(src).toContain('if (still || !reached || !goalMomentLive(moment, Date.now())) return;');
    expect(src).toContain('if (still && playing !== null) setPlaying(null);');
    expect(src).toContain('useNativeDriver: true');
  });

  it('hides its decoration from assistive technology, takes no touch and feels nothing', () => {
    expect((src.match(/accessibilityElementsHidden/g) ?? []).length).toBe(3);
    expect((src.match(/pointerEvents="none"/g) ?? []).length).toBe(3);
    expect(src).not.toMatch(/haptic\(/);
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      const source = m[1] ?? '';
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source) || /^\./.test(source),
        source,
      ).toBe(true);
    }
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(read('core.ts')).toContain("export * from './GoalBar';");
  });
});
