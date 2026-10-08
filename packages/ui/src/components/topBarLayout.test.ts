import { describe, expect, it } from 'vitest';
import {
  chipClearsMark,
  chipMaxWidth,
  chipRightEdge,
  MARK_CLEARANCE,
  markFits,
  markLeft,
  markSize,
  NARROW_BREAK,
  TOP_BAR_AVATAR,
  TOP_BAR_GAP,
  TOP_BAR_GUTTER,
} from './topBarLayout';

describe('topBarLayout — the caps (BRANDING.md §2b)', () => {
  it('caps the child chip at 150, or 126 below 380', () => {
    expect(chipMaxWidth(430)).toBe(150);
    expect(chipMaxWidth(393)).toBe(150);
    expect(chipMaxWidth(NARROW_BREAK)).toBe(150);
    expect(chipMaxWidth(375)).toBe(126);
    expect(chipMaxWidth(320)).toBe(126);
  });

  it('draws the mark at 30, or 28 below 380', () => {
    expect(markSize(430)).toBe(30);
    expect(markSize(NARROW_BREAK)).toBe(30);
    expect(markSize(375)).toBe(28);
  });
});

describe('topBarLayout — the chip clears the mark and the mark is centered', () => {
  for (const width of [375, 430]) {
    it(`at ${width}: the chip at its cap, plus a gap, stays inside the left half`, () => {
      // the left half ends where the mark begins
      const leftHalf = width / 2 - markSize(width) / 2;
      expect(TOP_BAR_GUTTER + chipMaxWidth(width) + TOP_BAR_GAP).toBeLessThanOrEqual(leftHalf);
      expect(chipRightEdge(width) + TOP_BAR_GAP).toBeLessThanOrEqual(markLeft(width));
      expect(chipClearsMark(width)).toBe(true);
    });

    it(`at ${width}: the chip's clearance is real, not just true at its cap`, () => {
      // WHAT ARITHMETIC HERE CANNOT PROVE, stated once so it is not attempted a third time.
      // `markLeft(w) + markSize(w) / 2 === w / 2` is an identity for any mark size. So is
      // `markLeft(w) === w - (markLeft(w) + markSize(w))`, which replaced it in a first attempt
      // at this fix and is the same tautology rearranged. NOTHING computed from `markLeft` can
      // witness the bar's centering, because the bar never called `markLeft` — it positioned the
      // mark with `left: '50%'`, which is why it drew off center on a phone while this file was
      // green. The component is held by the source tripwire in interaction.test.ts.
      //
      // What IS worth asserting is the inequality `chipClearsMark` exists to express, and that it
      // is not vacuous: it must hold at the cap, and it must FAIL for a chip wide enough to reach
      // the mark. A predicate that cannot return false is not a check.
      expect(chipClearsMark(width)).toBe(true);
      const overWide = TOP_BAR_GUTTER + chipMaxWidth(width) + TOP_BAR_GAP;
      expect(overWide).toBeLessThanOrEqual(markLeft(width));
      // the same predicate, with a chip that does reach: it must say no
      const reaches = markLeft(width) - TOP_BAR_GUTTER - TOP_BAR_GAP + 1;
      expect(TOP_BAR_GUTTER + reaches + TOP_BAR_GAP <= markLeft(width)).toBe(false);
    });
  }
});

/**
 * THE MARK GIVES WAY (the owner's screenshots, 2026-09-28: on an Android phone 1080 px wide the
 * heart was drawn over the first letters of the sync chip's "5 queued" and "Not synced").
 *
 * `markFits` is the whole decision; TopBar only measures the three edges it is handed (the source
 * tripwire in interaction.test.ts holds the wiring). The edges here are the bar's own layout
 * coordinates, as onLayout reports them: the bell is 34 across (IconButton) and the account
 * avatar TOP_BAR_AVATAR, with a TOP_BAR_GAP between the controls and a TOP_BAR_GUTTER at each end.
 */
describe('topBarLayout — the mark steps aside when a chip needs its room', () => {
  const BELL = 34;
  /** Where the right group starts with nothing to report: the bell and the avatar alone. */
  const quietRight = (width: number) =>
    width - TOP_BAR_GUTTER - (BELL + TOP_BAR_GAP + TOP_BAR_AVATAR);
  /** The same, with the optional appearance control beside the bell (the admin console's bar). */
  const quietRightWithAppearance = (width: number) => quietRight(width) - (BELL + TOP_BAR_GAP);

  it("gives way on the owner's phone to a sync chip under it, and comes back after", () => {
    // 1080 px at 2.625 px to the point
    const width = 1080 / 2.625;
    const mark = markSize(width);
    const heartLeft = width / 2 - mark / 2;
    const heartRight = width / 2 + mark / 2;
    // the baby's chip on the left is well clear: a short name, "0 days" and a photo, ~118 across
    const leftEnd = TOP_BAR_GUTTER + 118;
    // a sync chip whose first letters are under the heart, as in the screenshots
    expect(markFits(width, leftEnd, heartLeft + 10, mark)).toBe(false);
    expect(markFits(width, leftEnd, heartRight - 1, mark)).toBe(false);
    // and one that ends up just short of the heart still does not leave it room to breathe
    expect(markFits(width, leftEnd, heartRight + MARK_CLEARANCE - 0.5, mark)).toBe(false);
    // the queue sent, the chip goes quiet and the right group is the bell and the avatar again
    expect(markFits(width, leftEnd, quietRight(width), mark)).toBe(true);
  });

  it('says no from either side on its own, and yes at exactly the clearance', () => {
    const width = 390;
    const mark = markSize(width);
    const heartLeft = width / 2 - mark / 2;
    const heartRight = width / 2 + mark / 2;
    const roomyLeft = TOP_BAR_GUTTER;
    const roomyRight = width - TOP_BAR_GUTTER;
    // exactly the clearance on each side is room enough
    expect(markFits(width, heartLeft - MARK_CLEARANCE, heartRight + MARK_CLEARANCE, mark)).toBe(
      true,
    );
    // a long name or a large font reaching in from the left, with nothing on the right
    expect(markFits(width, heartLeft - MARK_CLEARANCE + 0.5, roomyRight, mark)).toBe(false);
    expect(markFits(width, heartLeft + 4, roomyRight, mark)).toBe(false);
    // a sync chip reaching in from the right, with nothing on the left
    expect(markFits(width, roomyLeft, heartRight + MARK_CLEARANCE - 0.5, mark)).toBe(false);
    expect(markFits(width, roomyLeft, heartLeft, mark)).toBe(false);
    // a group that has run PAST the heart, as a right group wider than half the bar does
    expect(markFits(width, roomyLeft, width / 2 - 60, mark)).toBe(false);
    expect(markFits(width, width / 2 + 60, roomyRight, mark)).toBe(false);
  });

  it('never hides the mark in the bar the design draws on a quiet day, at any phone width', () => {
    // the child chip at its cap and nothing to report: the mark, and the night light door behind
    // it, must stay. 380 is the tight one, where the capped chip comes within 7 of the heart.
    for (let width = 360; width <= 430; width += 0.5) {
      const mark = markSize(width);
      expect(markFits(width, chipRightEdge(width), quietRight(width), mark), `at ${width}`).toBe(
        true,
      );
      expect(
        markFits(width, chipRightEdge(width), quietRightWithAppearance(width), mark),
        `with the appearance control at ${width}`,
      ).toBe(true);
    }
  });

  it('asks for less than a control gap, which would hide the mark at 380 on a quiet day', () => {
    // why MARK_CLEARANCE is its own number: the capped chip is 7 from the heart at 380 by design
    // (markDoor.ts), so TOP_BAR_GAP would drop the heart for any name long enough to reach the cap
    expect(MARK_CLEARANCE).toBeLessThan(TOP_BAR_GAP);
    expect(MARK_CLEARANCE).toBeGreaterThan(0);
    expect(markFits(380, chipRightEdge(380), quietRight(380), markSize(380), TOP_BAR_GAP)).toBe(
      false,
    );
    expect(markFits(380, chipRightEdge(380), quietRight(380), markSize(380))).toBe(true);
  });
});
