import { describe, expect, it } from 'vitest';
import {
  countMarkTap,
  MARK_DOOR_IDLE_MS,
  MARK_DOOR_TAPS,
  markDoorClearsChip,
  markHitSlop,
} from './markDoor';
import { countTap, EGG_IDLE_MS, EGG_TAPS } from './starfield';
import { chipRightEdge, markLeft, markSize } from './topBarLayout';

describe("the heart's door: three quick taps", () => {
  it('opens on the third tap when each lands within the window of the last', () => {
    const a = countMarkTap(null, 1000);
    const b = countMarkTap(a.run, 1000 + MARK_DOOR_IDLE_MS);
    const c = countMarkTap(b.run, 1000 + 2 * MARK_DOOR_IDLE_MS);
    expect([a.fired, b.fired, c.fired]).toEqual([false, false, true]);
    expect(c.count).toBe(MARK_DOOR_TAPS);
    // and it starts again after opening, so a fourth tap is not a second opening
    expect(countMarkTap(c.run, 1000 + 2 * MARK_DOOR_IDLE_MS + 50).fired).toBe(false);
  });

  it('starts again after a pause, so a heart brushed twice now and once later opens nothing', () => {
    const two = countMarkTap(countMarkTap(null, 0).run, 200);
    const late = countMarkTap(two.run, 200 + MARK_DOOR_IDLE_MS + 1);
    expect(late.fired).toBe(false);
    expect(late.count).toBe(1);
  });

  it("leaves the About credits' own seven-in-two-seconds exactly as it was", () => {
    let run = null as ReturnType<typeof countTap>['run'];
    let fired = false;
    for (let i = 0; i < EGG_TAPS; i++) {
      const r = countTap(run, i * EGG_IDLE_MS);
      run = r.run;
      fired = r.fired;
    }
    expect(fired).toBe(true);
  });
});

describe("the heart's target", () => {
  it('is 44 pt across and 44 pt tall at every supported width', () => {
    for (let w = 360; w <= 430; w += 1) {
      const s = markHitSlop(w);
      expect(markSize(w) + s.left + s.right, `across at ${w}`).toBeGreaterThanOrEqual(44);
      expect(markSize(w) + s.top + s.bottom, `tall at ${w}`).toBeGreaterThanOrEqual(44);
      // lopsided only where the chip is close, and never by more than the chip takes away
      expect(s.right, `right at ${w}`).toBeLessThanOrEqual(16);
    }
    // at 380 the chip's cap steps up and the slop toward it gives way
    expect(markHitSlop(380).left).toBeLessThan(markHitSlop(379).left);
  });

  it('clears the child chip at its widest on every supported phone, and the check can say no', () => {
    for (let w = 360; w <= 430; w += 1) expect(markDoorClearsChip(w), `at ${w}`).toBe(true);
    // a predicate that cannot return false is not a check: a bar too narrow for both must fail it
    expect(chipRightEdge(300) < markLeft(300)).toBe(false);
    expect(markDoorClearsChip(300)).toBe(false);
  });
});
