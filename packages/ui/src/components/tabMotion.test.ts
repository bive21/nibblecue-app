/**
 * THE TAB BAR WHEN THE TAB CHANGES (`tabMotion.ts`): the new tab's icon hops, and nothing else about
 * the bar moves — the dot included, which slid from the tab you left until the owner found movement
 * at both ends of the bar distracting (2026-09-26). Two halves, the way this package tests anything
 * that moves: the numbers are PURE and are measured here — the dot under the middle of every cell at
 * every width and every count, the hop held to its three points — and what can only be seen on a
 * device (the native driver, the still bar under reduce motion and in the amber Night, cells whose
 * ids, roles and states are untouched) is held by tripwires over `TabBar.tsx`, because this suite
 * has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import {
  TAB_BAR_INSET,
  TAB_BAR_PAD,
  TAB_BAR_PADDING,
  TAB_CELL_PAD,
  TAB_DOT,
  TAB_DOT_FOOT,
  TAB_GLYPH,
  TAB_LABEL_GAP,
  tabBarHeight,
  tabDotClearance,
  tabLayout,
} from './tabLayout';
import { TAB_DOT_BOTTOM, TAB_HOP, TAB_HOP_FRAME, tabDotLeft, tabMove } from './tabMotion';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const WIDTHS = [320, 360, 375, 390, 414, 430];
const LABELS = ['Today', 'Stash', 'Shopping', 'Schedule', 'Reports', 'More'];

describe('the dot sits where it always did', () => {
  it('under the middle of the current cell, at every width and every count', () => {
    for (const width of WIDTHS)
      for (let count = 4; count <= 6; count += 1) {
        const labels = LABELS.slice(0, count);
        for (let i = 0; i < count; i += 1) {
          const { cellWidth } = tabLayout(labels, width, 'icons', 1, i);
          // the cells share the bar's inner width equally, after its padding
          const cellMiddle = TAB_BAR_PADDING + (i + 0.5) * cellWidth;
          expect(tabDotLeft(i, cellWidth) + TAB_DOT / 2, `${width}/${count}/${i}`).toBeCloseTo(
            cellMiddle,
            9,
          );
          // and never outside the pill
          const half = TAB_DOT / 2;
          expect(cellMiddle - half).toBeGreaterThan(0);
          expect(cellMiddle + half).toBeLessThan(width - 2 * TAB_BAR_INSET);
        }
      }
  });

  it('at the foot of the cell: 1 pt above it, inside the row’s own padding', () => {
    expect(TAB_DOT_BOTTOM).toBe(TAB_BAR_PAD + TAB_DOT_FOOT);
    for (const policy of ['icons', 'focus', 'rounded'] as const) {
      // clear of the glyph (or the label) above it, in every label policy
      const cellFoot = TAB_CELL_PAD[policy].bottom;
      expect(TAB_DOT_FOOT + TAB_DOT, policy).toBeLessThanOrEqual(cellFoot);
      expect(TAB_DOT_BOTTOM + TAB_DOT).toBeLessThan(tabBarHeight(policy));
    }
  });
});

describe('the hop', () => {
  it('rises three points, dips a hair past its place, and is home, in 260 ms', () => {
    expect(TAB_HOP.ms).toBe(260);
    expect(sampleFrame(TAB_HOP_FRAME, 0)).toBe(0);
    expect(sampleFrame(TAB_HOP_FRAME, 1)).toBe(0);
    expect(Math.min(...TAB_HOP_FRAME.outputRange)).toBeCloseTo(-3, 9);
    expect(Math.max(...TAB_HOP_FRAME.outputRange)).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(TAB_HOP_FRAME.extrapolate).toBe('clamp');
  });

  it('stays in its own cell: the glyph never reaches the cell’s top or the dot at its foot', () => {
    for (const policy of ['icons', 'focus', 'rounded'] as const) {
      const up = -Math.min(...TAB_HOP_FRAME.outputRange);
      const down = Math.max(...TAB_HOP_FRAME.outputRange);
      // the cell pads its glyph from the pill's own padding above
      expect(up, policy).toBeLessThan(TAB_BAR_PAD + TAB_CELL_PAD[policy].top);
      // and the glyph dips less than the clear space above the dot, so it never touches it
      expect(down, policy).toBeLessThan(tabDotClearance(policy));
      // nor its own label below it: the glyph's gap to the label is what the dip eats into
      expect(down).toBeLessThan(TAB_LABEL_GAP);
    }
    expect(TAB_GLYPH).toBe(23);
  });
});

describe('when anything moves', () => {
  it('only when the tab changes: never as the bar first appears, or for the same tab again', () => {
    expect(tabMove(null, 0, false)).toEqual({ hop: false });
    expect(tabMove(2, 2, false)).toEqual({ hop: false });
    expect(tabMove(-1, 2, false)).toEqual({ hop: false });
    expect(tabMove(0, 3, false)).toEqual({ hop: true });
    expect(tabMove(4, 1, false)).toEqual({ hop: true });
  });

  it('never under reduce motion or in the amber Night: nothing hops', () => {
    expect(tabMove(0, 3, true)).toEqual({ hop: false });
  });
});

describe('the bar (tripwires over TabBar.tsx)', () => {
  const src = flat('TabBar.tsx');

  it('keeps every cell what it was: its role, its selected state, its name and its id', () => {
    expect(src).toContain('accessibilityRole="tab"');
    expect(src).toContain('accessibilityLabel={tab.name ?? tab.label}');
    expect(src).toContain('accessibilityState={{ selected: current }}');
    expect(src).toMatch(/testID: `\$\{testID\}\.\$\{tab\.key\}`/);
    expect(src).toContain('accessibilityRole="tablist"');
    // the cells still share the row, and the tour still wraps them as it did
    expect(src).toContain('wrapCell(tab.key, pressable, CELL_WRAPPER)');
  });

  it('draws one dot, over the row, in the ink it always had, taking no touches', () => {
    expect(src.split('styles.dot').length - 1).toBe(1);
    expect(src).toContain(
      'left: dotLeft, bottom: TAB_DOT_BOTTOM, width: TAB_DOT, height: TAB_DOT,',
    );
    expect(src).toContain('backgroundColor: t.color.accent2');
    expect(src).toMatch(/<View pointerEvents="none" style=\{\[ styles\.dot,/);
    expect(src).not.toContain('opacity: current ? 1 : 0');
  });

  it('decides each move with the pure rule, and holds still when nothing may move', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(src).toContain('const move = tabMove(shown.current, currentIndex, still);');
    expect(src).toContain('if (!move.hop) {');
    expect(src).toContain('hop.setValue(1);');
  });

  /**
   * THE MOVEMENT IS ONLY WHERE THE FINGER IS (the owner, 2026-09-26: *"the vibration should be only
   * to where the new menu page is clicked on, not both where you were from to the new page youre
   * on"*). The dot slid out of the tab being left and stretched on its way; it is drawn in place.
   */
  it('never moves the dot: it is drawn under the tab you are on, and only that tab hops', () => {
    expect(src).not.toContain('translateX');
    expect(src).not.toContain('dotX');
    expect(src).not.toContain('scaleX');
    expect(src).not.toMatch(/Animated\.View pointerEvents="none"/);
  });

  it('runs on the native driver, transforms only, and hops only the tab you are on', () => {
    expect(src.split('useNativeDriver: true').length - 1).toBe(1);
    expect(src).not.toContain('useNativeDriver: false');
    expect(src).toContain('<Animated.View style={current ? motion.hop : null}>');
    expect(src).toContain('hop: { transform: [{ translateY: drive(hop, TAB_HOP_FRAME) }] }');
  });

  it('is never felt, and colors never move', () => {
    expect(src).not.toContain('haptic(');
    expect(src).not.toMatch(/interpolateColor|backgroundColor: .*interpolate/);
  });
});
