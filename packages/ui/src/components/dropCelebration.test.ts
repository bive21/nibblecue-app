/**
 * THE MOMENT MILK LANDS IN THE STASH, FRAME BY FRAME (`dropCelebration.ts`; the owner, 2026-09-26:
 * *"adding to milk stash is quite a proud moment … lets do some animation"*). Node cannot play an
 * animation, so what is held here is its script: the order of its beats, that every table the
 * native driver is handed is one it can draw, that each part starts and ends where it should, that
 * every mote stays on the stage — and that nothing in it knows how much milk there was.
 */
import { describe, expect, it } from 'vitest';
import {
  DROP_ITEM_TOP,
  DROP_LANDING,
  DROP_MS,
  DROP_STAGE,
  DROP_TARGET_TOP,
  eased,
  easeInQuad,
  itemFall,
  itemOpacity,
  itemTurn,
  keys,
  labelOpacity,
  labelRise,
  moteKeys,
  motes,
  stageOpacity,
  targetScale,
  type Keys,
} from './dropCelebration';

/** A table read at a moment, as the native driver draws it: linear between its points. */
function at(k: Keys, t: number): number {
  if (t <= k.input[0]!) return k.output[0]!;
  for (let i = 1; i < k.input.length; i += 1)
    if (t <= k.input[i]!) {
      const t0 = k.input[i - 1]!;
      const t1 = k.input[i]!;
      const v0 = k.output[i - 1]!;
      const v1 = k.output[i]!;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  return k.output[k.output.length - 1]!;
}

const TABLES: [string, Keys][] = [
  ['stage', stageOpacity()],
  ['card', targetScale()],
  ['fall', itemFall()],
  ['turn', itemTurn()],
  ['container', itemOpacity()],
  ['amount', labelOpacity()],
  ['rise', labelRise()],
  ...(['sparkle', 'frost'] as const).flatMap(kind =>
    motes(kind).flatMap((m, i) => {
      const k = moteKeys(m, kind);
      return [
        [`${kind} ${i} x`, k.x],
        [`${kind} ${i} y`, k.y],
        [`${kind} ${i} scale`, k.scale],
        [`${kind} ${i} opacity`, k.opacity],
      ] as [string, Keys][];
    }),
  ),
];

describe('the beats, in order', () => {
  it('veil, fall, landing, bounces, the amount, the fade — and over in under a second and a half', () => {
    const m = DROP_MS;
    expect(m.fall).toBeLessThan(m.enter);
    expect(m.enter).toBeLessThan(m.land);
    expect(m.land).toBeLessThan(m.settle);
    expect(m.land).toBeLessThan(m.labelIn);
    expect(m.labelIn).toBeLessThan(m.labelFull);
    expect(m.labelFull).toBeLessThan(m.labelOut);
    expect(m.labelOut).toBeLessThan(m.labelGone);
    expect(m.labelGone).toBeLessThanOrEqual(m.exit);
    expect(m.settle).toBeLessThan(m.exit);
    expect(m.exit).toBeLessThan(m.total);
    expect(m.total).toBeLessThanOrEqual(1500);
    // every mote is gone before the fade begins
    for (const kind of ['sparkle', 'frost'] as const)
      for (const mote of motes(kind))
        expect(m.land + mote.delay + m.mote, kind).toBeLessThanOrEqual(m.exit);
  });

  it('hands the native driver only tables it can draw: from 0 to the end, strictly in order', () => {
    for (const [name, k] of TABLES) {
      expect(k.input[0], name).toBe(0);
      expect(k.input.at(-1), name).toBe(DROP_MS.total);
      expect(k.input.length, name).toBe(k.output.length);
      for (let i = 1; i < k.input.length; i += 1)
        expect(k.input[i]!, name).toBeGreaterThan(k.input[i - 1]!);
      for (const v of k.output) expect(Number.isFinite(v), name).toBe(true);
    }
  });

  it('stitches stretches without a repeated moment, and holds before and after them', () => {
    const k = keys([
      [100, 1],
      [100, 2],
      [300, 3],
    ]);
    expect(k.input).toEqual([0, 100, 300, DROP_MS.total]);
    expect(k.output).toEqual([1, 1, 3, 3]);
    const e = eased(0, 100, 0, 10, easeInQuad, 4);
    expect(e[0]).toEqual([0, 0]);
    expect(e.at(-1)).toEqual([100, 10]);
  });
});

describe('each part does what the header says', () => {
  it('veils the sheet for the moment, and lifts the veil at the end', () => {
    const k = stageOpacity();
    expect(at(k, 0)).toBe(0);
    expect(at(k, DROP_MS.enter)).toBe(1);
    expect(at(k, DROP_MS.exit)).toBe(1);
    expect(at(k, DROP_MS.total)).toBe(0);
  });

  it('drops the container from above, faster as it falls, onto the card at the landing', () => {
    const k = itemFall();
    expect(at(k, 0)).toBe(-DROP_STAGE.drop);
    expect(at(k, DROP_MS.fall)).toBe(-DROP_STAGE.drop);
    expect(at(k, DROP_MS.land)).toBe(0);
    // accelerating: it covers more in the second half of the fall than in the first
    const mid = (DROP_MS.fall + DROP_MS.land) / 2;
    expect(at(k, DROP_MS.land) - at(k, mid)).toBeGreaterThan(at(k, mid) - at(k, DROP_MS.fall));
    // and it is where it rests once the bounces are over
    expect(at(k, DROP_MS.settle)).toBe(0);
    expect(at(k, DROP_MS.total)).toBe(0);
  });

  it('bounces twice, the second smaller than the first, and never below where it lands', () => {
    const k = itemFall();
    const after = k.input
      .map((t, i) => [t, k.output[i]!] as const)
      .filter(([t]) => t > DROP_MS.land);
    const high = Math.min(...after.map(([, v]) => v));
    expect(high).toBe(-16);
    expect(at(k, DROP_MS.land + 240)).toBe(-5);
    for (const [, v] of after) expect(v).toBeLessThanOrEqual(0);
  });

  it('gives the card a little under the landing, and settles it', () => {
    const k = targetScale();
    expect(at(k, DROP_MS.land)).toBe(1);
    expect(Math.min(...k.output.filter((_, i) => k.input[i]! > DROP_MS.land))).toBeGreaterThan(0.9);
    expect(at(k, DROP_MS.total)).toBe(1);
  });

  it('turns the container a little as it falls and lands it upright', () => {
    const k = itemTurn();
    expect(Math.abs(at(k, DROP_MS.fall))).toBeLessThanOrEqual(8);
    expect(at(k, DROP_MS.land)).toBe(0);
  });

  it('says the amount only after the landing, rising, and is gone before the fade', () => {
    expect(at(labelOpacity(), DROP_MS.land)).toBe(0);
    expect(at(labelOpacity(), DROP_MS.labelFull)).toBe(1);
    expect(at(labelOpacity(), DROP_MS.labelGone)).toBe(0);
    expect(at(labelRise(), DROP_MS.labelGone)).toBe(-DROP_STAGE.label.rise);
  });
});

describe('the motes', () => {
  it('six sparkles, or eight frost motes that settle downward', () => {
    expect(motes('sparkle')).toHaveLength(6);
    expect(motes('frost')).toHaveLength(8);
    for (const m of motes('frost')) expect(m.dy).toBeGreaterThan(0);
    // sparkles go out from the landing, mostly upward
    expect(motes('sparkle').filter(m => m.dy < 0).length).toBeGreaterThanOrEqual(4);
  });

  it('never leave the stage, at their farthest', () => {
    for (const kind of ['sparkle', 'frost'] as const)
      for (const m of motes(kind)) {
        const k = moteKeys(m, kind);
        const xs = k.x.output.map(v => DROP_LANDING.x + v);
        const ys = k.y.output.map(v => DROP_LANDING.y + v);
        expect(Math.min(...xs) - m.size, kind).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs) + m.size, kind).toBeLessThanOrEqual(DROP_STAGE.width);
        expect(Math.min(...ys) - m.size, kind).toBeGreaterThanOrEqual(0);
        expect(Math.max(...ys) + m.size, kind).toBeLessThanOrEqual(DROP_STAGE.height);
        // each one is gone by its end
        expect(at(k.opacity, DROP_MS.land + m.delay + DROP_MS.mote)).toBe(0);
      }
  });
});

describe('the stage', () => {
  it('stands the container on the card, and the card at the foot of the stage', () => {
    expect(DROP_TARGET_TOP + DROP_STAGE.target.height).toBe(DROP_STAGE.height);
    expect(DROP_ITEM_TOP).toBeGreaterThan(0);
    expect(DROP_ITEM_TOP + DROP_STAGE.item.height).toBeGreaterThan(DROP_TARGET_TOP);
    // it falls from inside the screen above the stage, not from nowhere
    expect(DROP_ITEM_TOP - DROP_STAGE.drop).toBeLessThan(0);
    expect(DROP_STAGE.drop).toBeLessThan(DROP_STAGE.height);
  });

  it('knows nothing of the amount: the same moment for a quarter ounce as for a whole bag', () => {
    // the script's functions take no amount at all — the amount is only the words in the pill
    for (const f of [
      stageOpacity,
      targetScale,
      itemFall,
      itemTurn,
      itemOpacity,
      labelOpacity,
      labelRise,
    ])
      expect(f.length).toBe(0);
    expect(motes.length).toBe(1);
  });
});
