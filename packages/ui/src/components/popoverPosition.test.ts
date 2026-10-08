import { describe, expect, it } from 'vitest';
import { POPOVER_GAP, POPOVER_WIDTH, popoverPosition } from './popoverPosition';

const win = { width: 390, height: 844 };
const MARGIN = 11;

describe('popoverPosition', () => {
  it('hangs below the anchor from its top-right corner: right edges line up', () => {
    const anchor = { x: 300, y: 40, width: 34, height: 34 };
    const f = popoverPosition(anchor, win, POPOVER_WIDTH, MARGIN);
    expect(f.placement).toBe('below');
    expect(f.width).toBe(272);
    expect(f.left + f.width).toBe(anchor.x + anchor.width);
    expect(f.left).toBe(62);
    if (f.placement === 'below') expect(f.top).toBe(40 + 34 + POPOVER_GAP);
    expect(f.maxHeight).toBe(Math.floor(844 * 0.78));
  });

  it('clamps inside the window when the anchor is near the left edge', () => {
    const f = popoverPosition({ x: 4, y: 40, width: 34, height: 34 }, win, POPOVER_WIDTH, MARGIN);
    expect(f.left).toBe(MARGIN);
    expect(f.left + f.width).toBeLessThanOrEqual(win.width - MARGIN);
  });

  it('clamps inside the window when the anchor hangs past the right edge', () => {
    const f = popoverPosition({ x: 380, y: 40, width: 34, height: 34 }, win, POPOVER_WIDTH, MARGIN);
    expect(f.left + f.width).toBe(win.width - MARGIN);
  });

  it('flips above the anchor when there is no room below', () => {
    const anchor = { x: 300, y: 780, width: 34, height: 34 };
    const f = popoverPosition(anchor, win, POPOVER_WIDTH, MARGIN);
    expect(f.placement).toBe('above');
    if (f.placement === 'above') expect(f.bottom).toBe(win.height - (anchor.y - POPOVER_GAP));
    expect(f.maxHeight).toBe(Math.floor(844 * 0.78));
  });

  it('caps the height at what is left below a low anchor rather than flipping when above is worse', () => {
    const short = { width: 390, height: 300 };
    const f = popoverPosition(
      { x: 300, y: 120, width: 34, height: 34 },
      short,
      POPOVER_WIDTH,
      MARGIN,
    );
    // 300 - 11 - (120 + 34 + 6) = 129 below, 120 - 6 - 11 = 103 above → stay below, capped
    expect(f.placement).toBe('below');
    expect(f.maxHeight).toBe(129);
  });

  it('narrows to the window on a small screen', () => {
    const f = popoverPosition(
      { x: 200, y: 40, width: 34, height: 34 },
      { width: 280, height: 600 },
      272,
      MARGIN,
    );
    expect(f.width).toBe(280 - 2 * MARGIN);
    expect(f.left).toBe(MARGIN);
  });

  it('without an anchor sits in the top-right corner', () => {
    const f = popoverPosition(null, win, POPOVER_WIDTH, MARGIN);
    expect(f.placement).toBe('below');
    if (f.placement === 'below') expect(f.top).toBe(MARGIN);
    expect(f.left + f.width).toBe(win.width - MARGIN);
  });

  it('never exceeds 78% of the window', () => {
    const f = popoverPosition({ x: 300, y: 0, width: 34, height: 34 }, win, POPOVER_WIDTH, MARGIN);
    expect(f.maxHeight).toBeLessThanOrEqual(Math.floor(win.height * 0.78));
  });
});
