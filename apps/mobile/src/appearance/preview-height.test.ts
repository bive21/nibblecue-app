/**
 * THE PREVIEW HAS A HEIGHT BUDGET, and this is it.
 *
 * The Appearance sheet is a preview PINNED above a scrolling list of controls, so the two
 * compete for the same screen: every point the picture takes is a point the radio rows,
 * swatches and switches do not get. The first build spent too many of them and the controls
 * underneath were a squint (the owner, 2026-09-17: "the UI view display example is too high,
 * making the setting to be very small, need to shorten it").
 *
 * A rendered height cannot be measured in node — the mini app lays itself out on a device and
 * reports back through `onLayout` — so what is asserted here is the two things that DECIDE that
 * height: the scale the content is multiplied by, and which blocks are in it. Both are visible
 * in the source, and both are exactly what a later change would reach for.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
// read, never imported: the component pulls in React Native, which does not parse in node
const src = readFileSync(join(here, 'AppearancePreview.tsx'), 'utf8');
const flat = src.replace(/\s+/g, ' ');
const PREVIEW_SCALE = Number(/export const PREVIEW_SCALE = ([\d.]+);/.exec(src)?.[1]);

/**
 * The ceiling. The displayed height is the content's natural height times the scale, so this
 * number IS the budget: raising it makes the preview taller by exactly that ratio, which is the
 * change this test exists to stop happening by accident.
 */
const SCALE_CEILING = 0.6;

describe('the preview stays small enough to leave the controls room', () => {
  it('scales the mini app down to at most the budgeted fraction', () => {
    expect(PREVIEW_SCALE, 'PREVIEW_SCALE is no longer a plain literal').not.toBeNaN();
    expect(PREVIEW_SCALE).toBeLessThanOrEqual(SCALE_CEILING);
    // and it is a real reduction, not a rounding: a preview at full size is not a preview
    expect(PREVIEW_SCALE).toBeGreaterThan(0.3);
    expect(flat).toContain('transform: [{ scale: PREVIEW_SCALE }]');
    // the window's height is the content's, times the same number — one source for both
    expect(flat).toContain('height: Math.round(contentHeight * PREVIEW_SCALE)');
  });

  it('draws the chrome and the Quick row, and nothing that only repeats them', () => {
    // the three blocks that carry an appearance choice: the bar, the household's own tiles, the
    // tabs. The Quick row also carries the Log-row preference, which is a layout the preview can
    // actually show — four tiles slide as three-and-a-peek or wrap onto a second line — so it is
    // wired rather than described, and it is off by default, which is the shape it already drew.
    for (const block of [
      '<TopBar',
      '<QuickRow items={items} scroll={resolved.logSlider} />',
      '<TabBar',
    ]) {
      expect(flat, block).toContain(block);
    }
    // the NEXT card showed the same radius, surface, accent and shadow a Quick tile already has,
    // and cost a block of height to do it
    expect(src).not.toContain('NextCard');
  });

  it('spends no gap on a list of one', () => {
    // the Quick row is alone in its group now, so a `gap` there is padding with nothing to space
    expect(flat).toContain('<View style={{ paddingHorizontal: t.space.xxl }}> <QuickRow');
  });
});
