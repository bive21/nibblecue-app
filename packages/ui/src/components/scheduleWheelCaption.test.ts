/**
 * NOTHING ON THE RING EVER OVERLAPS ANYTHING ELSE ON THE RING.
 *
 * The owner has reported this twice. The second report (2026-09-22) came with a screenshot of a
 * ring built from perfectly ordinary intervals — a bottle every 2h, a diaper every 4h, wake 7:00,
 * bed 9:30 PM — in which "3:15 PM", "5:15 PM" and "7:15 PM" were each printed straight through
 * their own three-cell house, and "7:00 AM Wake" sat on a stop's house at the top left.
 *
 * TWO THINGS WERE WRONG, and the first one is why the previous test passed:
 *
 *   1. A caption that ran past the card's edge was CLAMPED back inside it — onto the house it had
 *      just cleared. At phone width the ring's right flank has about 58 points to the rim and a
 *      caption box is 68 wide, so on a real phone the clamp fired on every stop out there. The
 *      test that shipped with the previous fix used a 500-point box "with generous headroom on
 *      purpose", which is exactly the case that never happens.
 *   2. A caption only ever checked its OWN house. It knew nothing about the neighbouring stop's
 *      house, the caption already standing where it wanted to go, or the sun and the moon.
 *
 * So this file does not test a single caption any more. It builds whole rings from the interval
 * combinations a household actually picks, at the sizes the component actually draws, and asserts
 * the one property that matters: after `placeCaptions`, no caption rectangle intersects any house
 * rectangle or any other caption rectangle. A caption that cannot be placed is dropped, which is
 * allowed — the house is the fact and the words are the convenience — so the suite also checks
 * that a normal day still gets most of its captions rather than a bald ring.
 */
import { describe, expect, it } from 'vitest';
import {
  placeCaptions,
  wheelPoint,
  CAPTION_H,
  CAPTION_H_ONE,
  CAPTION_WIDTH,
  HOUSE_H,
  __geometry,
  type WheelHouse,
} from './wheelGeometry';

/** MIN_SIZE and MAX_SIZE from ScheduleWheel, plus the phone widths in between. */
const SIZES = [250, 300, 330, 360];
/** RING_FRACTION from ScheduleWheel. */
const RING_FRACTION = 0.34;
/** HUB_IN from ScheduleWheel: the hub's edge is this far inside the ring. */
const HUB_IN = 28;
/** The hub ScheduleWheel draws at a size, as `placeCaptions` is handed it. */
const hubOf = (size: number) => ({ x: size / 2, y: size / 2, r: size * RING_FRACTION - HUB_IN });
/** One-cell (22) up to a three-cell house with a count (82) — every width `houseWidth` produces. */
const HOUSE_WIDTHS = [22, 42, 62, 82];
/**
 * The most stops core will put on a waking arc: `WHEEL_MERGE_DEG` is 34°, and a 300° day arc
 * divided by that is nine. Anything closer becomes one house before this file ever sees it.
 */
const MAX_STOPS = 9;

const rect = (p: { left: number; top: number; compact?: boolean }) => ({
  left: p.left,
  top: p.top,
  width: CAPTION_WIDTH,
  height: p.compact === true ? CAPTION_H_ONE : CAPTION_H,
});

/**
 * A ring of `n` stops spread over the waking arc, the way an interval rhythm lays them out, with
 * the sun and the moon at the ends. `wide` decides how fat the houses are: a household running
 * bottles and diapers on top of each other gets three-cell houses all the way round.
 */
function ring(n: number, size: number, houseWidth: number): WheelHouse[] {
  const c = size / 2;
  const r = size * RING_FRACTION;
  const wakeDeg = 320;
  const dayArc = 300;
  const ends: WheelHouse[] = [
    {
      deg: wakeDeg,
      ...wheelPoint(wakeDeg, r, c, c),
      width: 26,
      priority: 0,
      required: true,
      compactHeight: CAPTION_H_ONE,
    },
    {
      deg: (wakeDeg + dayArc) % 360,
      ...wheelPoint((wakeDeg + dayArc) % 360, r, c, c),
      width: 26,
      priority: 0,
      required: true,
      compactHeight: CAPTION_H_ONE,
    },
  ];
  const stops: WheelHouse[] = Array.from({ length: n }, (_, i) => {
    const deg = (wakeDeg + ((i + 1) * dayArc) / (n + 1)) % 360;
    return {
      deg,
      ...wheelPoint(deg, r, c, c),
      width: houseWidth,
      priority: 1,
      compactHeight: CAPTION_H_ONE,
    };
  });
  return [...ends, ...stops];
}

/** Every rectangle the ring draws, captions and houses alike, and whether any two of them touch. */
function collisions(houses: readonly WheelHouse[], size: number): string[] {
  const hub = hubOf(size);
  const placed = placeCaptions(houses, size, hub);
  const houseRects = houses.map(h => __geometry.houseRect(h));
  const captionRects = placed.map(p => (p === null ? null : rect(p)));
  const bad: string[] = [];
  captionRects.forEach((cap, i) => {
    if (cap === null) return;
    if (__geometry.onHub(cap, hub)) bad.push(`caption ${i} on the hub`);
    houseRects.forEach((h, j) => {
      if (__geometry.intersects(cap, h)) bad.push(`caption ${i} on house ${j}`);
    });
    captionRects.forEach((other, j) => {
      if (j <= i || other === null) return;
      if (__geometry.intersects(cap, other)) bad.push(`caption ${i} on caption ${j}`);
    });
  });
  return bad;
}

describe('the ring never draws two things on top of each other', () => {
  it('holds for every stop count, house width and wheel size the app can draw', () => {
    const failures: string[] = [];
    for (const size of SIZES) {
      /* 1 stop (one feed a day) up to `MAX_STOPS`. Past that the ring is not this file's problem:
         core's `mergeByAngle` folds anything closer than `WHEEL_MERGE_DEG` into one house, so a
         waking arc can hold about nine stops however short the intervals are, and a sweep beyond
         that would be testing a ring the app cannot produce. */
      for (let n = 1; n <= MAX_STOPS; n += 1) {
        for (const w of HOUSE_WIDTHS) {
          const bad = collisions(ring(n, size, w), size);
          if (bad.length > 0) failures.push(`${n} stops, width ${w}, size ${size}: ${bad[0]}`);
        }
      }
    }
    expect(failures.slice(0, 8), `${failures.length} rings overlapped`).toEqual([]);
  });

  it('holds for the ring in the owner\u2019s screenshot \u2014 2h bottles and 4h diapers, phone width', () => {
    // seven stops across a 14h30m waking window, three-cell houses where the two rhythms meet
    const size = 360;
    const houses = ring(7, size, 82);
    expect(collisions(houses, size)).toEqual([]);
  });

  it('still captions most of a normal day rather than going bald to avoid the problem', () => {
    // six stops, two-cell houses, full width: the everyday case must keep its times
    const size = 360;
    const placed = placeCaptions(ring(6, size, 42), size);
    expect(placed.filter(p => p !== null).length).toBeGreaterThanOrEqual(6);
  });

  it('never drops the sun or the moon, however crowded the ring is', () => {
    for (const size of SIZES) {
      const placed = placeCaptions(ring(MAX_STOPS, size, 82), size);
      expect(placed[0], `wake at ${size}`).not.toBeNull();
      expect(placed[1], `bed at ${size}`).not.toBeNull();
    }
  });

  it('keeps every caption it does place inside the card', () => {
    for (const size of SIZES) {
      for (const p of placeCaptions(ring(9, size, 62), size)) {
        if (p === null) continue;
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.top).toBeGreaterThanOrEqual(0);
        expect(p.left + CAPTION_WIDTH).toBeLessThanOrEqual(size);
        expect(p.top + (p.compact === true ? CAPTION_H_ONE : CAPTION_H)).toBeLessThanOrEqual(size);
      }
    }
  });

  it('puts a caption beside its house at the ring’s side when there is room for one', () => {
    const size = 360;
    const c = size / 2;
    const house: WheelHouse = { deg: 90, x: c + 60, y: c, width: 42, priority: 1 };
    const [p] = placeCaptions([house], size);
    expect(p?.side).toBe('right');
    expect(p?.align).toBe('left');
    expect(p?.left).toBeGreaterThanOrEqual(house.x + house.width / 2);
    expect((p?.top ?? 0) + CAPTION_H / 2).toBeCloseTo(house.y, 5);
  });

  it('goes above or below instead when the side would run off the card', () => {
    const size = 360;
    // a wide house right at the rim: there is no room for 68 points of caption beside it
    const house: WheelHouse = { deg: 90, x: size - 50, y: size / 2, width: 82, priority: 1 };
    const [p] = placeCaptions([house], size);
    expect(p).not.toBeNull();
    expect(['above', 'below']).toContain(p?.side);
    // and it really is clear of the house, which is what the clamp used to break
    expect(
      __geometry.intersects(rect(p as { left: number; top: number }), __geometry.houseRect(house)),
    ).toBe(false);
  });

  it('drops a caption rather than printing it on a house when nothing is clear', () => {
    const size = 250;
    /* Houses tiled across the whole card, so every candidate box for every one of them lands on
       something. This is not a ring the app can draw; it is the degenerate case, and the rule it
       pins is the one that matters: when there is nowhere clear, the words go and the houses
       stay. The old code had no such rule — it clamped the caption back inside the card and drew
       it through whatever was there. */
    const houses: WheelHouse[] = [];
    for (let y = 20; y < size; y += HOUSE_H + 4) {
      for (let x = 45; x < size; x += 90) {
        houses.push({ deg: 90, x, y, width: 82, priority: 1 + houses.length });
      }
    }
    const placed = placeCaptions(houses, size);
    expect(
      placed.some(p => p === null),
      'nothing was dropped',
    ).toBe(true);
    expect(collisions(houses, size)).toEqual([]);
  });
});

/**
 * THE HUB IS AN OBSTACLE (the owner, 2026-09-26, with a screenshot: "The wheel needs fixing still.
 * It can't be behind the circle"). A stop at the ring's right flank, with a house above it and one
 * below, had no room outward (the card's edge), above or below (its neighbours' houses), so its
 * caption took the last side it was offered — inward — which is where the hub is. The hub is drawn
 * over the captions, so "3:32 PM to 6:30 PM" came out half under the disc.
 */
describe('no caption stands on the hub', () => {
  /** The screenshot's ring: sun at 7:00, moon at 7:30 PM, and five houses round the right side. */
  function screenshotRing(size: number): WheelHouse[] {
    const c = size / 2;
    const r = size * RING_FRACTION;
    const at = (deg: number, width: number, extra: Partial<WheelHouse> = {}): WheelHouse => ({
      deg,
      ...wheelPoint(deg, r, c, c),
      width,
      priority: 1,
      captionHeight: 32,
      compactHeight: CAPTION_H_ONE,
      ...extra,
    });
    return [
      at(315, 26, { priority: 0, required: true }),
      at(125, 26, { priority: 0, required: true }),
      at(350, 62),
      at(30, 82),
      at(62, 82),
      at(92, 82),
      at(108, 62),
      at(175, 82),
    ];
  }

  it('holds for the ring in the owner’s screenshot, at every wheel size', () => {
    for (const size of SIZES) expect(collisions(screenshotRing(size), size), `${size}`).toEqual([]);
  });

  it('drops the words of a stop boxed in on every side rather than hide them under the hub', () => {
    const size = 330;
    const placed = placeCaptions(screenshotRing(size), size, hubOf(size));
    for (const p of placed) {
      if (p === null) continue;
      expect(__geometry.onHub(rect(p), hubOf(size))).toBe(false);
    }
  });

  it('still keeps the sun and the moon, even when the only room left is by the hub', () => {
    for (const size of SIZES) {
      const placed = placeCaptions(ring(MAX_STOPS, size, 82), size, hubOf(size));
      expect(placed[0], `wake at ${size}`).not.toBeNull();
      expect(placed[1], `bed at ${size}`).not.toBeNull();
    }
  });

  it('can say no: a box over the middle of the wheel is on the hub', () => {
    const size = 330;
    const hub = hubOf(size);
    expect(
      __geometry.onHub({ left: hub.x - 10, top: hub.y - 10, width: 68, height: 32 }, hub),
    ).toBe(true);
    expect(__geometry.onHub({ left: 0, top: 0, width: 68, height: 32 }, hub)).toBe(false);
  });
});
