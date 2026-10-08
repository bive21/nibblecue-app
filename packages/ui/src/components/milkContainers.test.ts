/**
 * THE CONTAINER PICTURES' GEOMETRY (`milkContainers.ts`): each drawing inside its grid with room for
 * its stroke, standing on one floor, its milk inside its body; the level honest to the amount; the
 * rise and the wiggle ending exactly where they should.
 */
import { describe, expect, it } from 'vitest';
import {
  easeOut,
  MILK_ART,
  MILK_RISE_MS,
  MILK_SHAPE_ART,
  MILK_SHAPES,
  MILK_SLIVER,
  milkFill,
  milkLevelAt,
  milkLevelY,
  WIGGLE,
  WIGGLE_MS,
} from './milkContainers';

/** The points an absolute M/L/H/V/C/Z path passes through, control points included. */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+/g) ?? [];
  let cmd = '';
  for (let i = 0; i < tokens.length;) {
    const tok = tokens[i]!;
    if (/[MLHVCZ]/.test(tok)) {
      cmd = tok;
      i += 1;
      continue;
    }
    const n = (k: number) => Number(tokens[i + k]);
    if (cmd === 'M' || cmd === 'L') {
      x = n(0);
      y = n(1);
      out.push([x, y]);
      i += 2;
    } else if (cmd === 'H') {
      x = n(0);
      out.push([x, y]);
      i += 1;
    } else if (cmd === 'V') {
      y = n(0);
      out.push([x, y]);
      i += 1;
    } else if (cmd === 'C') {
      out.push([n(0), n(1)], [n(2), n(3)]);
      x = n(4);
      y = n(5);
      out.push([x, y]);
      i += 6;
    } else {
      throw new Error(`unexpected ${cmd} in ${d}`);
    }
  }
  return out;
}

const bounds = (d: string) => {
  const p = points(d);
  return {
    minX: Math.min(...p.map(q => q[0])),
    maxX: Math.max(...p.map(q => q[0])),
    minY: Math.min(...p.map(q => q[1])),
    maxY: Math.max(...p.map(q => q[1])),
  };
};

describe('the three drawings', () => {
  it('each stays inside the grid with room for its stroke', () => {
    const pad = MILK_ART.stroke / 2;
    for (const shape of MILK_SHAPES) {
      const art = MILK_SHAPE_ART[shape];
      for (const d of [art.body, art.cap, art.details]) {
        const b = bounds(d);
        expect(b.minX, shape).toBeGreaterThanOrEqual(pad);
        expect(b.maxX, shape).toBeLessThanOrEqual(MILK_ART.width - pad);
        expect(b.minY, shape).toBeGreaterThanOrEqual(pad);
        expect(b.maxY, shape).toBeLessThanOrEqual(MILK_ART.height - pad);
      }
    }
  });

  it('all stand on one floor, so three side by side read as one family', () => {
    for (const shape of MILK_SHAPES) {
      expect(bounds(MILK_SHAPE_ART[shape].body).maxY, shape).toBe(59);
      expect(MILK_SHAPE_ART[shape].well.bottom, shape).toBe(59);
    }
  });

  it('keeps each well inside its body, under its cap', () => {
    for (const shape of MILK_SHAPES) {
      const art = MILK_SHAPE_ART[shape];
      const body = bounds(art.body);
      expect(art.well.top, shape).toBeGreaterThanOrEqual(body.minY);
      expect(art.well.top, shape).toBeGreaterThanOrEqual(bounds(art.cap).maxY);
      expect(art.well.left, shape).toBeGreaterThanOrEqual(body.minX - 1e-9);
      expect(art.well.right, shape).toBeLessThanOrEqual(body.maxX + 1e-9);
      expect(art.well.bottom - art.well.top, shape).toBeGreaterThan(30);
    }
  });
});

describe('the milk stands at the amount', () => {
  it('fills by the amount over the size, never past full, never below empty', () => {
    expect(milkFill(3, 6)).toBe(0.5);
    expect(milkFill(12, 6)).toBe(1);
    expect(milkFill(0, 6)).toBe(0);
    expect(milkFill(-1, 6)).toBe(0);
    expect(milkFill(3, 0)).toBe(0);
    expect(milkFill(Number.NaN, 6)).toBe(0);
  });

  it('rises with the amount, top when full, floor when empty, a visible sliver for a little', () => {
    for (const shape of MILK_SHAPES) {
      const well = MILK_SHAPE_ART[shape].well;
      expect(milkLevelY(well, 0)).toBe(well.bottom);
      expect(milkLevelY(well, 1)).toBe(well.top);
      expect(well.bottom - milkLevelY(well, 0.001)).toBeCloseTo(MILK_SLIVER, 6);
      let last = well.bottom;
      for (let f = 0.1; f <= 1.0001; f += 0.1) {
        const y = milkLevelY(well, f);
        expect(y, `${shape} at ${f}`).toBeLessThanOrEqual(last);
        last = y;
      }
    }
  });

  it('eases to a new level and lands on it exactly', () => {
    expect(milkLevelAt(0.2, 0.8, 0)).toBe(0.2);
    expect(milkLevelAt(0.2, 0.8, MILK_RISE_MS)).toBe(0.8);
    expect(milkLevelAt(0.2, 0.8, MILK_RISE_MS * 10)).toBe(0.8);
    // most of the way there by the middle, as liquid finds its level
    expect(milkLevelAt(0, 1, MILK_RISE_MS / 2)).toBeGreaterThan(0.8);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });
});

describe('the wiggle', () => {
  it('rocks left and right, less each time, and stands still where it started', () => {
    expect(WIGGLE.input[0]).toBe(0);
    expect(WIGGLE.input.at(-1)).toBe(WIGGLE_MS);
    expect(WIGGLE.degrees[0]).toBe(0);
    expect(WIGGLE.degrees.at(-1)).toBe(0);
    for (let i = 1; i < WIGGLE.input.length; i += 1)
      expect(WIGGLE.input[i]!).toBeGreaterThan(WIGGLE.input[i - 1]!);
    const swings = WIGGLE.degrees.slice(1, -1);
    for (let i = 1; i < swings.length; i += 1) {
      expect(Math.sign(swings[i]!)).toBe(-Math.sign(swings[i - 1]!));
      expect(Math.abs(swings[i]!)).toBeLessThan(Math.abs(swings[i - 1]!));
    }
    // a small rock, not a spin
    expect(Math.max(...WIGGLE.degrees.map(Math.abs))).toBeLessThanOrEqual(10);
  });
});
