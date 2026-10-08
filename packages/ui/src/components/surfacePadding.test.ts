import { describe, expect, it } from 'vitest';
import {
  coverBorderBox,
  flattenStyle,
  PADDING_KEYS,
  safeRadius,
  splitPadding,
} from './surfacePadding';

describe('flattenStyle — react-native semantics without react-native', () => {
  it('flattens nested arrays and lets the later entry win', () => {
    expect(flattenStyle([{ a: 1, b: 2 }, [{ b: 3 }, { c: 4 }]])).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('ignores the falsy entries a conditional style produces', () => {
    expect(flattenStyle([null, undefined, false, { a: 1 }])).toEqual({ a: 1 });
    expect(flattenStyle(null)).toEqual({});
  });
});

describe('splitPadding — padding never reaches the decorated box', () => {
  it('moves every padding key to the content and leaves everything else on the box', () => {
    const { box, content } = splitPadding({
      padding: 14,
      borderRadius: 15,
      backgroundColor: 'x',
      marginTop: 4,
    });
    expect(content).toEqual({ padding: 14 });
    expect(box).toEqual({ borderRadius: 15, backgroundColor: 'x', marginTop: 4 });
  });

  it('handles every padding spelling, including the logical ones', () => {
    const all = Object.fromEntries(PADDING_KEYS.map((k, i) => [k, i + 1]));
    const { box, content } = splitPadding(all);
    expect(content).toEqual(all);
    expect(box).toEqual({});
  });

  it('keeps MARGIN on the box — it is not padding and must not move', () => {
    // margin positions the surface in its parent; moving it inside would change the layout.
    const { box, content } = splitPadding({ margin: 8, marginHorizontal: 2, padding: 6 });
    expect(box).toEqual({ margin: 8, marginHorizontal: 2 });
    expect(content).toEqual({ padding: 6 });
  });

  it('resolves a Card-shaped style array the way the component receives it', () => {
    // Card.tsx passes `[padded ? { padding: t.space.xl } : null, style]`
    const { box, content } = splitPadding([{ padding: 14 }, { marginTop: 11, paddingTop: 2 }]);
    expect(content).toEqual({ padding: 14, paddingTop: 2 });
    expect(box).toEqual({ marginTop: 11 });
  });

  it('is empty in, empty out', () => {
    expect(splitPadding(undefined)).toEqual({ box: {}, content: {} });
  });
});

describe('coverBorderBox — an absolute fill must cover the border box, not the padding box', () => {
  it('pulls the layer out by the border width on every side', () => {
    expect(coverBorderBox(1)).toEqual({
      position: 'absolute',
      top: -1,
      left: -1,
      right: -1,
      bottom: -1,
    });
    expect(coverBorderBox(2.5).top).toBe(-2.5);
  });

  it('is a no-op without a border, and never produces a positive inset', () => {
    expect(coverBorderBox(0)).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
    expect(coverBorderBox(-3).top).toBe(0);
    expect(coverBorderBox(Number.NaN).left).toBe(0);
  });
});

describe('safeRadius — a radius over half the box stops being a circle', () => {
  it('clamps to half the shorter side', () => {
    // the bubble case: a 56pt circle with a 1pt border leaves an absoluteFill child 54 wide
    // with a radius of 28 — larger than half its box. React Native clamps that as CSS would;
    // this makes the clamp explicit where a caller computes a radius.
    expect(safeRadius(28, 54, 54)).toBe(27);
    expect(safeRadius(28, 56, 56)).toBe(28);
  });

  it('leaves a radius that already fits alone', () => {
    expect(safeRadius(15, 300, 120)).toBe(15);
    expect(safeRadius(22, 160, 96)).toBe(22);
  });

  it('never returns a negative radius or trips on a missing size', () => {
    expect(safeRadius(-5, 50, 50)).toBe(0);
    expect(safeRadius(12, 0, 0)).toBe(12);
    expect(safeRadius(12, Number.NaN, Number.NaN)).toBe(12);
  });
});

describe('coverBorderBox — the radius travels with the box', () => {
  // This is the invariant that catches both geometry slips: the first fix left the box a pt too
  // small for its radius, the second a pt too large. Only a check that ties the two together
  // catches either, so it is expressed as a property over every border width and size the design
  // system actually uses, not as two examples. (Neither slip was the octagon the owner saw —
  // shadows.ts — but each was a real hairline, and this keeps them fixed.)
  const circleIsExact = (size: number, border: number): boolean => {
    const box = coverBorderBox(border, size / 2);
    const width = size - 2 * box.left; // left is negative, so this GROWS the box
    return box.borderRadius === width / 2;
  };

  for (const size of [24, 31, 36, 54, 56, 72]) {
    for (const border of [0, 1, 1.5, 2, 2.5, 3]) {
      it(`a ${size}pt circle under a ${border}pt border stays a circle`, () => {
        expect(circleIsExact(size, border)).toBe(true);
      });
    }
  }

  it('reproduces the first slip: absoluteFill keeps the full radius on an inset box', () => {
    // box 54 under a 1pt ring, radius still 28 — radius LARGER than half its box
    const insetWidth = 56 - 2 * 1;
    expect(28).toBeGreaterThan(insetWidth / 2);
  });

  it('reproduces the second slip: an expanded box keeping the old radius', () => {
    // box 58, radius 28 — radius SMALLER than half, so a flat edge on each side
    const grownWidth = 56 + 2 * 1;
    expect(28).toBeLessThan(grownWidth / 2);
    // and the fix closes exactly that gap
    expect(coverBorderBox(1, 28).borderRadius).toBe(grownWidth / 2);
  });

  it('leaves the radius alone when the caller does not pass one', () => {
    expect(coverBorderBox(2).borderRadius).toBeUndefined();
  });

  it('is a no-op offset with no border, and still reports the radius unchanged', () => {
    expect(coverBorderBox(0, 12)).toMatchObject({ top: 0, left: 0, borderRadius: 12 });
  });

  it('ignores a nonsense border width rather than producing NaN offsets', () => {
    for (const bad of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      const box = coverBorderBox(bad, 10);
      expect(Number.isFinite(box.top)).toBe(true);
      expect(box.borderRadius).toBe(10);
    }
  });
});
