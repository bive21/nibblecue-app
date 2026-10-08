/**
 * THE ROW THAT JUST CHANGED WASHES ONCE (the owner, 2026-09-26, of setup's "How often?" rows). The
 * wash's shape and its rule are PURE (`savedWash.ts`) and held here, with the one measurement that
 * matters: every word and glyph on the row, over the wash at its fullest, in every scheme and day
 * theme. That it sits UNDER the row, takes no touch, is hidden from a screen reader and draws
 * nothing under reduce motion or in the amber Night is held by tripwires over `SavedWash.tsx`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, contrastRatio } from '../theme/contrast';
import { themeNames } from '../theme/theme';
import { sampleFrame } from './keyframes';
import { WASH_DELAY_MS, WASH_KEYS, WASH_MS, washes, washFrames } from './savedWash';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 401 }, (_, i) => i / 400);

describe('when a row washes', () => {
  it('for each new save it is told of, and for nothing else', () => {
    expect(washes(0, 1, false)).toBe(true);
    expect(washes(1, 2, false)).toBe(true);
    // the same count again is the same save: a re-render washes nothing
    expect(washes(2, 2, false)).toBe(false);
    // no save at all: the page's own starting points, or another row's save
    expect(washes(0, 0, false)).toBe(false);
    expect(washes(3, 0, false)).toBe(false);
  });

  it('never under reduce motion or in the amber Night', () => {
    expect(washes(0, 1, true)).toBe(false);
  });
});

describe('the wash', () => {
  const opacity = washFrames().opacity;
  const values = STEPS.map(t => sampleFrame(opacity, t));

  it('comes up, holds a moment and goes, starting and ending at nothing', () => {
    expect(WASH_KEYS[0]).toEqual([0, 0]);
    expect(WASH_KEYS[WASH_KEYS.length - 1]).toEqual([1, 0]);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(0);
    expect(Math.max(...values)).toBe(1);
    // quicker up than down: it arrives as a flash of attention and leaves as a fade
    const up = STEPS.find(t => sampleFrame(opacity, t) >= 1) ?? 1;
    const down = 1 - ([...STEPS].reverse().find(t => sampleFrame(opacity, t) >= 1) ?? 0);
    expect(up).toBeLessThan(down);
  });

  it('is short, and starts a beat after the sheet has gone', () => {
    expect(WASH_MS).toBeLessThanOrEqual(600);
    expect(WASH_DELAY_MS).toBeGreaterThan(0);
    expect(WASH_DELAY_MS).toBeLessThanOrEqual(220);
  });
});

/**
 * THE ROW OVER THE WASH AT ITS FULLEST. Setup's rhythm rows are drawn on the step's own card
 * (`surfaceSolid`), and the wash is the accent's `tint` — 14% of the accent over that very surface,
 * already opaque. On it: the title in `text` (in `text2` when the rhythm is off), the sentence in
 * `text2`, and the chevron, a `text2` glyph. The amber Night draws no wash.
 */
describe('every word on the row, over the wash at its fullest', () => {
  it('reads at 4.5:1 (words) and 3:1 (the chevron) in every scheme and day theme', () => {
    const failures: string[] = [];
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames.filter(n => n !== 'night')) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        const wash = deriveAccent(c).tint;
        const check = (what: string, ink: string, min: number) => {
          const v = contrastRatio(ink, wash);
          if (v < min) failures.push(`${scheme}/${theme}: ${what} = ${v.toFixed(2)}`);
        };
        check('text (the title)', c.text, AA_TEXT);
        check('text2 (the sentence, a muted title)', c.text2, AA_TEXT);
        check('text2 (the chevron)', c.text2, AA_GRAPHIC);
      }
    expect(failures).toEqual([]);
  });
});

describe('the component (tripwires over SavedWash.tsx)', () => {
  const src = withoutComments(read('SavedWash.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('washes only a save it has not answered yet', () => {
    expect(flat).toContain('const was = useRef(token);');
    expect(flat).toContain('const play = washes(was.current, token, still);');
  });

  it('draws nothing under reduce motion or in the amber Night, and never leaves a wash behind', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('run.stop(); wash.setValue(1);');
    // 1 is rest, where the frame is nothing
    expect(flat).toContain('new Animated.Value(1)');
  });

  it('is a layer UNDER the row: first in its box, taking no touch, hidden from a screen reader', () => {
    const layer = flat.indexOf('<Animated.View pointerEvents="none"');
    expect(layer).toBeGreaterThan(-1);
    expect(layer).toBeLessThan(flat.indexOf('{children}'));
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style=\{\[StyleSheet\.absoluteFill, layer\]\}/,
    );
  });

  it('changes an opacity on the native driver, and nothing else', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).not.toMatch(/transform/);
  });
});
