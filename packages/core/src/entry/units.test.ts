import { describe, expect, it } from 'vitest';
import {
  displayToTemp,
  gramsToKg,
  gramsToKgStep,
  gramsToLbOz,
  gridTap,
  kgToGrams,
  lbOzToGrams,
  lengthLabel,
  lengthRateLabel,
  lengthStep,
  lengthToMm,
  mlToVolume,
  mmToLengthStep,
  sharedVolumeSymbol,
  snapToStep,
  STEP,
  stepValue,
  tempToDisplay,
  UNIT_LABEL,
  volumeNumber,
  volumeParts,
  volumeShortParts,
  volumeStep,
  volumeSymbol,
  asLabeledMl,
  volumeAsRead,
  volumeSum,
  volumeTapStep,
  volumeText,
  volumeToMl,
  weightLabel,
  weightStep,
} from './units';

describe('the step table (PRODUCT_SPEC.md §5.2)', () => {
  it('is the spec’s table, value for value', () => {
    // a quarter ounce and five milliliters since 2026-09-26: a number is dragged or typed now,
    // and the step is how finely it lands (the owner: "user can type 5.25oz")
    expect(STEP.volume_oz).toBe(0.25);
    expect(STEP.volume_ml).toBe(5);
    expect(STEP.minutes).toBe(1);
    // one minute a tap since 2026-10-06, as every other length
    expect(STEP.sleep_minutes).toBe(1);
    expect(STEP.weight).toBe(0.1);
    expect(STEP.temp).toBe(0.1);
    expect(STEP.length).toBe(0.25);
  });

  it('steps a sleep by the minute, as tummy time (the owner, 2026-10-06)', () => {
    expect(STEP.sleep_minutes).toBe(STEP.minutes);
  });

  it('picks the volume step from the viewer’s own unit', () => {
    expect(volumeStep('oz')).toBe(0.25);
    expect(volumeStep('ml')).toBe(5);
  });

  /**
   * A TAP IS STILL HALF AN OUNCE WHERE THERE IS NO RULER (2026-09-26): the pump's pair moves by the
   * half it always did, and each tap lands on the typed grid, so a tap never makes a number the
   * grid could not have held.
   */
  it('taps a volume with no ruler by the half ounce, on the typed grid', () => {
    expect(volumeTapStep('oz')).toBe(0.5);
    expect(volumeTapStep('ml')).toBe(10);
    for (const unit of ['oz', 'ml'] as const) {
      const k = volumeTapStep(unit) / volumeStep(unit);
      expect(k, unit).toBe(Math.round(k));
      expect(k, unit).toBeGreaterThan(1);
    }
  });

  /**
   * EVERY QUARTER OUNCE COMES BACK AS ITSELF. Storage is whole milliliters and the display is one
   * decimal of an ounce, so a quarter is only recoverable because every sheet puts its amount back
   * on the grid (`Math.round(mlToVolume(ml) / step) * step`) — which works only while the two
   * roundings together stay inside half a step. They do, by a wide margin: at most half a
   * milliliter and a twentieth of an ounce, against an eighth.
   */
  it('keeps every quarter ounce a parent can type, through storage and back', () => {
    const step = volumeStep('oz');
    for (let q = 0; q <= 40 * 4; q += 1) {
      const oz = q / 4;
      const shown = Math.round(mlToVolume(volumeToMl(oz, 'oz'), 'oz') / step) * step;
      expect(shown, String(oz)).toBe(oz);
    }
    // the owner's own number: 5.25 oz is 155 ml, the arithmetic every surface does
    expect(volumeToMl(5.25, 'oz')).toBe(155);
  });
});

describe('stepValue', () => {
  it('never goes below zero (§5.2)', () => {
    expect(stepValue(0.5, -1, 0.5)).toBe(0);
    expect(stepValue(0, -1, 0.5)).toBe(0);
    expect(stepValue(0.5, -5, 0.5)).toBe(0);
  });

  it('is EXACTLY reversible — the whole reason display units are the source of truth', () => {
    for (const [start, step] of [
      [4, 0.5],
      [120, 10],
      [7.4, 0.1],
      [98.6, 0.1],
      [20.25, 0.25],
    ] as const) {
      let v: number = start;
      for (let i = 0; i < 20; i++) v = stepValue(v, 1, step);
      for (let i = 0; i < 20; i++) v = stepValue(v, -1, step);
      expect(v).toBe(start);
    }
  });

  it('shows no float artifact after the step that classically produces one', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754
    expect(stepValue(0.1, 2, 0.1)).toBe(0.3);
    expect(String(stepValue(0.1, 2, 0.1))).toBe('0.3');
  });
});

describe('volume', () => {
  it('round-trips a whole number of ounces through storage', () => {
    for (const oz of [1, 2.5, 4, 6.5, 8]) {
      expect(mlToVolume(volumeToMl(oz, 'oz'), 'oz')).toBe(oz);
    }
  });

  it('round-trips millilitres exactly', () => {
    for (const ml of [10, 60, 120, 240]) {
      expect(mlToVolume(volumeToMl(ml, 'ml'), 'ml')).toBe(ml);
    }
  });

  it('stores an integer, because consumed_ml is an int column', () => {
    expect(Number.isInteger(volumeToMl(4.5, 'oz'))).toBe(true);
    expect(volumeToMl(4, 'oz')).toBe(118);
  });

  it('lets two caregivers read one row in their own units', () => {
    const stored = volumeToMl(4, 'oz');
    expect(mlToVolume(stored, 'oz')).toBe(4);
    expect(mlToVolume(stored, 'ml')).toBe(118);
  });

  it('keeps a refused bottle at zero rather than turning it into nothing', () => {
    expect(volumeToMl(0, 'oz')).toBe(0);
    expect(mlToVolume(0, 'oz')).toBe(0);
  });

  /**
   * A SPLIT'S LAST BAG STILL POURS AS ITS LABEL (the owner, 2026-10-02: 9 oz → three "3 oz"
   * frozen bottles → bottle from stash logged 2.75 oz). 88 ml reads as 3 oz; the labeled pour is
   * 89 ml, not the 81 ml that is the most on the grid that still fits in the bag.
   */
  it('names a split remainder bag as its label, not the floor that fits on the grid', () => {
    expect(mlToVolume(88, 'oz')).toBe(3);
    expect(volumeText(88, 'oz')).toBe('3 oz');
    expect(asLabeledMl(88, 'oz')).toBe(volumeToMl(3, 'oz'));
    expect(asLabeledMl(88, 'oz')).toBe(89);
    expect(volumeText(asLabeledMl(88, 'oz'), 'oz')).toBe('3 oz');
    // already on the grid: unchanged
    expect(asLabeledMl(volumeToMl(3, 'oz'), 'oz')).toBe(volumeToMl(3, 'oz'));
    expect(asLabeledMl(81, 'oz')).toBe(81);
    // milliliters are already whole
    expect(asLabeledMl(88, 'ml')).toBe(88);
  });
});

/**
 * AN AMOUNT AS A PARENT READS IT (the owner, 2026-09-26: *"i added 7.25oz from existing 7oz stash,
 * on the main page it shows as total 14.3 oz … surely it can fit an extra digit?"*, and *"1000mL
 * show as 1L 1250mL show as 1.25L etc. therefore the digit stays maximum 3 or 4"*).
 */
describe('volumeText: ounces on their quarter grid, milliliters and liters', () => {
  it('reads the owner’s 7 oz and 7.25 oz, stored as 207 and 214 ml, as 14.25 oz — not 14.3, not 14.24', () => {
    const seven = volumeToMl(7, 'oz');
    const sevenAndAQuarter = volumeToMl(7.25, 'oz');
    expect([seven, sevenAndAQuarter]).toEqual([207, 214]);
    expect(seven + sevenAndAQuarter).toBe(421);
    // 421 ml is 14.2357 oz: rounding to hundredths would say 14.24, to tenths 14.2 or 14.3
    expect(volumeText(421, 'oz')).toBe('14.25 oz');
    expect(mlToVolume(421, 'oz')).toBe(14.25);
    expect(volumeParts(421, 'oz')).toEqual({ number: '14.25', unit: 'oz' });
  });

  it('reads every quarter ounce back as typed, two decimals at most and no trailing zero', () => {
    for (let q = 0; q <= 40; q += 0.25) {
      const typed = Math.round(q * 100) / 100;
      expect(volumeText(volumeToMl(typed, 'oz'), 'oz'), String(typed)).toBe(`${typed} oz`);
    }
    expect(volumeText(volumeToMl(14.5, 'oz'), 'oz')).toBe('14.5 oz');
    expect(volumeText(volumeToMl(14, 'oz'), 'oz')).toBe('14 oz');
    expect(volumeText(0, 'oz')).toBe('0 oz');
  });

  it('does NOT read a sum of stored ml back as typed: the same amount rounds the same way every time', () => {
    // the pre-launch sweep, 2026-09-27. A random dozen bags stayed inside half a quarter ounce,
    // because their roundings cancelled; a newborn's bottles are the same ounce every time, and
    // theirs add up — nine 1 oz bottles are 270 ml, 9.13 oz, and the nearest quarter is 9.25
    expect(volumeToMl(1, 'oz')).toBe(30);
    expect(volumeText(9 * volumeToMl(1, 'oz'), 'oz')).toBe('9.25 oz');
    expect(volumeText(13 * volumeToMl(4, 'oz'), 'oz')).toBe('51.75 oz');
    expect(volumeText(8 * volumeToMl(3.5, 'oz'), 'oz')).toBe('28.25 oz');
  });

  it('adds entries up as they read (`volumeSum`), so any sum of quarter ounces reads back as typed', () => {
    expect(volumeText(volumeSum(Array<number>(9).fill(volumeToMl(1, 'oz')), 'oz'), 'oz')).toBe(
      '9 oz',
    );
    expect(volumeText(volumeSum(Array<number>(13).fill(volumeToMl(4, 'oz')), 'oz'), 'oz')).toBe(
      '52 oz',
    );
    // every amount a parent can type, repeated as a day of bottles or a freezer of bags would be,
    // and mixed at random: whatever the ml rounded, the figure is the sum of what was typed
    for (let q = 0.25; q <= 10; q += 0.25) {
      const ml = volumeToMl(q, 'oz');
      for (const n of [1, 2, 7, 9, 12, 30, 60, 240]) {
        const typed = Math.round(q * n * 100) / 100;
        expect(volumeText(volumeSum(Array<number>(n).fill(ml), 'oz'), 'oz'), `${n} × ${q}`).toBe(
          `${typed} oz`,
        );
      }
    }
    let seed = 7;
    const next = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let trial = 0; trial < 500; trial += 1) {
      const bags = Array.from(
        { length: 1 + Math.floor(next() * 60) },
        () => Math.round((1 + next() * 32) / 4 / 0.25) * 0.25,
      );
      const typed = Math.round(bags.reduce((a, b) => a + b, 0) * 100) / 100;
      const stored = bags.map(b => volumeToMl(b, 'oz'));
      expect(volumeText(volumeSum(stored, 'oz'), 'oz'), bags.join('+')).toBe(`${typed} oz`);
    }
  });

  it('adds milliliters as they are stored, and reads one amount as its own row does', () => {
    expect(volumeSum([30, 30, 30], 'ml')).toBe(90);
    expect(volumeText(volumeSum(Array<number>(9).fill(30), 'ml'), 'ml')).toBe('270 mL');
    expect(volumeSum([], 'oz')).toBe(0);
    // one amount counts in a total what its own row reads: 110 ml is 3.75 oz, 30 ml is 1 oz
    expect(volumeText(volumeAsRead(110, 'oz'), 'oz')).toBe(volumeText(110, 'oz'));
    expect(volumeAsRead(30, 'oz')).toBeCloseTo(29.5735, 3);
    expect(volumeAsRead(30, 'ml')).toBe(30);
  });

  it('puts an amount never typed on the grid on the nearest quarter', () => {
    // 110 ml from an ml reader is 3.72 oz
    expect(volumeText(110, 'oz')).toBe('3.75 oz');
    expect(mlToVolume(110, 'oz')).toBe(3.75);
  });

  it('writes milliliters whole under a thousand, and liters from a thousand', () => {
    expect(volumeText(120, 'ml')).toBe('120 mL');
    expect(volumeText(0, 'ml')).toBe('0 mL');
    expect(volumeText(999, 'ml')).toBe('999 mL');
    expect(volumeText(999.4, 'ml')).toBe('999 mL');
    // what rounds to a thousand is a liter, not "1000 mL"
    expect(volumeText(999.6, 'ml')).toBe('1 L');
    expect(volumeText(1000, 'ml')).toBe('1 L');
    expect(volumeText(1250, 'ml')).toBe('1.25 L');
    expect(volumeText(2400, 'ml')).toBe('2.4 L');
    expect(volumeText(1234, 'ml')).toBe('1.23 L');
    expect(volumeParts(1250, 'ml')).toEqual({ number: '1.25', unit: 'L' });
  });

  it('never runs past four digits in milliliters, whatever the amount', () => {
    for (let ml = 0; ml <= 60_000; ml += 7) {
      const { number } = volumeParts(ml, 'ml');
      expect(number.replace(/\D/g, '').length, String(ml)).toBeLessThanOrEqual(4);
    }
  });

  it('keeps ounces in ounces at any size', () => {
    expect(volumeSymbol(volumeToMl(184.5, 'oz'), 'oz')).toBe('oz');
    expect(volumeText(volumeToMl(184.5, 'oz'), 'oz')).toBe('184.5 oz');
  });

  it('gives a row that says its unit once the symbol of its largest amount', () => {
    expect(sharedVolumeSymbol([900, 120], 'ml')).toBe('mL');
    expect(sharedVolumeSymbol([900, 1200], 'ml')).toBe('L');
    expect(sharedVolumeSymbol([900, 1200], 'oz')).toBe('oz');
    expect(sharedVolumeSymbol([], 'ml')).toBe('mL');
    // "0.9 + 1.2 L", never "900 + 1.2 L"
    expect(`${volumeNumber(900, 'L')} + ${volumeNumber(1200, 'L')} L`).toBe('0.9 + 1.2 L');
  });

  it('keeps a sign as a real minus, and nothing is a plain zero', () => {
    expect(volumeNumber(-59, 'oz')).toBe('−2');
    expect(volumeNumber(-1500, 'L')).toBe('−1.5');
    expect(volumeNumber(-2, 'oz')).toBe('0');
    expect(volumeNumber(-0.2, 'mL')).toBe('0');
    expect(volumeNumber(Number.NaN, 'mL')).toBe('0');
  });

  it('names milliliters mL, the symbol a person reads, where the stored unit is ml', () => {
    expect(UNIT_LABEL.ml).toBe('mL');
    expect(UNIT_LABEL.oz).toBe('oz');
  });
});

/**
 * THE SHORT FORM (2026-09-26): what Today's report draws where a mixed day's quarter ounces would be
 * drawn under the report's floor, on the narrowest phone. Everything else reads `volumeText`.
 */
describe('volumeShortParts: the same amount in fewer digits, for a figure with no room', () => {
  it('rounds the quarter the exact figure writes to the whole ounce, as a person rounds it', () => {
    expect(volumeText(880, 'oz')).toBe('29.75 oz');
    expect(volumeShortParts(880, 'oz')).toEqual({ number: '30', unit: 'oz' });
    expect(volumeShortParts(421, 'oz')).toEqual({ number: '14', unit: 'oz' });
    expect(volumeShortParts(volumeToMl(14.5, 'oz'), 'oz')).toEqual({ number: '15', unit: 'oz' });
    // 428 ml is 14.47 oz and reads 14.5: the short form rounds the figure a phone shows, so the
    // phone beside it reads 15 and not 14
    expect(volumeText(428, 'oz')).toBe('14.5 oz');
    expect(volumeShortParts(428, 'oz')).toEqual({ number: '15', unit: 'oz' });
  });

  it('never rounds an amount under an ounce away to nothing, or up to an ounce', () => {
    for (const q of [0.25, 0.5, 0.75])
      expect(volumeShortParts(volumeToMl(q, 'oz'), 'oz'), String(q)).toEqual({
        number: '<1',
        unit: 'oz',
      });
    // nothing is nothing already, and so is an amount whose exact figure reads 0
    expect(volumeShortParts(0, 'oz')).toBeNull();
    expect(volumeText(3, 'oz')).toBe('0 oz');
    expect(volumeShortParts(3, 'oz')).toBeNull();
  });

  it('writes liters to one decimal and leaves milliliters as whole as they are', () => {
    expect(volumeShortParts(1250, 'ml')).toEqual({ number: '1.3', unit: 'L' });
    expect(volumeShortParts(1150, 'ml')).toEqual({ number: '1.2', unit: 'L' });
    expect(volumeShortParts(1234, 'ml')).toEqual({ number: '1.2', unit: 'L' });
    expect(volumeShortParts(1960, 'ml')).toEqual({ number: '2', unit: 'L' });
    for (const ml of [0, 120, 640, 999, 999.6, 1000, 1200, 2400])
      expect(volumeShortParts(ml, 'ml'), String(ml)).toBeNull();
  });

  it('has none where it would say the same, and none for a difference', () => {
    // 887 ml reads 30 oz exactly
    expect(volumeShortParts(887, 'oz')).toBeNull();
    expect(volumeShortParts(volumeToMl(184, 'oz'), 'oz')).toBeNull();
    expect(volumeShortParts(-880, 'oz')).toBeNull();
    expect(volumeShortParts(Number.NaN, 'oz')).toBeNull();
  });

  it('is always fewer characters than the exact figure, in the same symbol', () => {
    for (let ml = 0; ml <= 3000; ml += 1)
      for (const unit of ['oz', 'ml'] as const) {
        const short = volumeShortParts(ml, unit);
        if (short === null) continue;
        const exact = volumeParts(ml, unit);
        expect(short.unit, `${ml} ${unit}`).toBe(exact.unit);
        expect(short.number.length, `${ml} ${unit}`).toBeLessThan(exact.number.length);
      }
  });
});

describe('weight', () => {
  it('round-trips pounds and ounces within a tenth', () => {
    for (const v of [
      { lb: 7, oz: 4 },
      { lb: 8, oz: 0 },
      { lb: 12, oz: 15.5 },
    ]) {
      const back = gramsToLbOz(lbOzToGrams(v));
      expect(back.lb).toBe(v.lb);
      expect(Math.abs(back.oz - v.oz)).toBeLessThanOrEqual(0.1);
    }
  });

  it('carries a rounded 16 oz into the next pound instead of printing 16.0 oz', () => {
    // a gram count that lands just under 8 lb
    const g = lbOzToGrams({ lb: 7, oz: 15.99 });
    const back = gramsToLbOz(g);
    expect(back.oz).toBeLessThan(16);
    expect(back).toEqual({ lb: 8, oz: 0 });
  });

  it('round-trips kilograms', () => {
    for (const kg of [3.2, 5, 9.75]) expect(gramsToKg(kgToGrams(kg))).toBe(kg);
  });
});

/**
 * ONE SPELLING PER MEASUREMENT (the owner, 2026-09-24). 22 in is stored as 559 mm; the Log row
 * read it back as "22.01 in" and Reports as "22.0 in". Every screen now writes a measurement
 * through these, on its stepper's grid, the way the stepper showed it.
 */
describe('the labels every screen writes a measurement with', () => {
  it('writes a length as it was entered on the inch stepper, every quarter inch a tape reads', () => {
    expect(lengthLabel(lengthToMm(22, 'in'), 'in')).toBe('22 in');
    expect(lengthLabel(lengthToMm(22.25, 'in'), 'in')).toBe('22.25 in');
    expect(lengthLabel(lengthToMm(14.5, 'in'), 'in')).toBe('14.5 in');
    for (let q = 8 * 4; q <= 51 * 4; q += 1) {
      const inches = q / 4;
      expect(lengthLabel(lengthToMm(inches, 'in'), 'in')).toBe(`${inches} in`);
    }
  });

  it('writes a length as it was entered on the centimetre stepper, every millimetre', () => {
    expect(lengthLabel(521, 'cm')).toBe('52.1 cm');
    expect(lengthLabel(520, 'cm')).toBe('52 cm');
    for (let mm = 200; mm <= 1300; mm += 1) {
      expect(lengthLabel(lengthToMm(mm / 10, 'cm'), 'cm')).toBe(`${mm / 10} cm`);
    }
  });

  it('reads a length entered in cm to the nearest quarter inch, where the inch editor opens it', () => {
    // 52.0 cm is 20.47 in: written as an inch reader could have entered it
    expect(lengthLabel(520, 'in')).toBe('20.5 in');
    expect(mmToLengthStep(520, 'in')).toBe(20.5);
    // the difference between two measurements is a measurement: on the grid too
    expect(lengthLabel(lengthToMm(22.25, 'in') - lengthToMm(22, 'in'), 'in')).toBe('0.25 in');
  });

  it('writes a rate per 30 days as arithmetic, not snapped to a tape', () => {
    // 1.25 in over 33 days is 1.14 in per 30: a quarter-inch grid would say 1.25
    const perMonth = ((lengthToMm(23.25, 'in') - lengthToMm(22, 'in')) * 30) / 33;
    expect(lengthRateLabel(perMonth, 'in')).toBe('1.1 in');
    expect(lengthRateLabel(29, 'cm')).toBe('2.9 cm');
    expect(lengthRateLabel(30, 'cm')).toBe('3 cm');
  });

  it('writes a weight as its steppers showed it: pounds and a tenth of an ounce, or ten grams', () => {
    expect(weightLabel(lbOzToGrams({ lb: 7, oz: 4 }), 'lb_oz')).toBe('7 lb 4 oz');
    expect(weightLabel(lbOzToGrams({ lb: 7, oz: 4.3 }), 'lb_oz')).toBe('7 lb 4.3 oz');
    expect(weightLabel(lbOzToGrams({ lb: 0, oz: 15.2 }), 'lb_oz')).toBe('15.2 oz');
    expect(weightLabel(4530, 'kg')).toBe('4.53 kg');
    expect(weightLabel(4500, 'kg')).toBe('4.5 kg');
    expect(weightLabel(3000, 'kg')).toBe('3 kg');
    // every tenth of an ounce a scale reads, from 1 lb to 30 lb, comes back as entered
    for (let tenths = 16 * 10; tenths < 30 * 16 * 10; tenths += 1) {
      const lb = Math.floor(tenths / 160);
      const oz = (tenths % 160) / 10;
      expect(weightLabel(lbOzToGrams({ lb, oz }), 'lb_oz')).toBe(`${lb} lb ${oz} oz`);
    }
  });
});

/**
 * THE GROWTH STEPPERS' GRIDS (the audit of 2026-09-24). The sheet held millimetres and re-rounded
 * on every tap, starting from 500 mm (19.69 in), so 20, 22 or 24 in could never be entered and a
 * cm stepper under a 0.25 step moved +0.3 then −0.2. Now each stepper holds its display value on
 * its own grid, and every reading a tape or scale gives lands exactly and comes back exactly.
 */
describe('the growth grids', () => {
  it('names a step for every unit: a quarter inch, a millimetre, a tenth of an ounce, ten grams', () => {
    expect(lengthStep('in')).toBe(0.25);
    expect(lengthStep('cm')).toBe(0.1);
    expect(weightStep('lb_oz')).toBe(0.1);
    expect(weightStep('kg')).toBe(0.01);
  });

  it('puts a pre-fill on the grid, so the stepper can reach every mark from it', () => {
    expect(snapToStep(19.685, 0.25)).toBe(19.75);
    expect(mmToLengthStep(500, 'in')).toBe(19.75);
    expect(mmToLengthStep(500, 'cm')).toBe(50);
    expect(mmToLengthStep(503, 'cm')).toBe(50.3);
    expect(gramsToKgStep(3500)).toBe(3.5);
    expect(gramsToKgStep(4527)).toBe(4.53);
    // and from a grid value, every tap lands on the next mark and back
    let v = mmToLengthStep(500, 'in');
    for (let i = 0; i < 17; i += 1) v = stepValue(v, 1, lengthStep('in'));
    expect(v).toBe(24);
  });

  /**
   * A SAVED VALUE SHOWN EXACTLY, THEN STEPPED (`gridTap`): 110 ml is 3.7 oz, and the first tap
   * goes to the grid in its direction rather than stepping 4.2, 4.7… for ever — the Log's edit
   * sheet and the stash's "Correct the amount" both step this way.
   */
  it('lands the first tap from an off-grid value on the grid, then steps exactly', () => {
    expect(gridTap(3.7, 4.2, 0.5, 0, 17)).toBe(4);
    expect(gridTap(3.7, 3.2, 0.5, 0, 17)).toBe(3.5);
    expect(gridTap(4, 4.5, 0.5, 0, 17)).toBe(4.5);
    expect(gridTap(118, 128, 10, 0, 500)).toBe(120);
    expect(gridTap(4.53, 4.54, 0.01, 0.3, 30)).toBe(4.54);
    expect(gridTap(16.8, 16.9, 0.5, 0, 16.9)).toBe(16.9);
    // on the quarter grid the same way
    expect(gridTap(3.7, 3.95, 0.25, 0, 34)).toBe(3.75);
    expect(gridTap(3.7, 3.45, 0.25, 0, 34)).toBe(3.5);
  });

  /**
   * A NUMBER SET OUTRIGHT IS KEPT (2026-09-26): dragged to on the ruler, or typed. Only a change of
   * exactly one step is a tap to re-aim; anything else is where the parent put it, clamped.
   */
  it('keeps a value that was typed or dragged to, rather than re-aiming it as a tap', () => {
    expect(gridTap(3.7, 5.25, 0.25, 0, 34)).toBe(5.25);
    expect(gridTap(3.7, 2, 0.25, 0, 34)).toBe(2);
    expect(gridTap(3.7, 40, 0.25, 0, 34)).toBe(34);
    expect(gridTap(118, 250, 5, 0, 1000)).toBe(250);
  });

  it('keeps every quarter inch a tape can read, through storage and back', () => {
    for (let q = 8 * 4; q <= 51 * 4; q += 1) {
      const inches = q / 4;
      expect(mmToLengthStep(lengthToMm(inches, 'in'), 'in')).toBe(inches);
    }
  });

  it('keeps every millimetre in cm, and every ten grams in kg, through storage and back', () => {
    for (let mm = 200; mm <= 1300; mm += 1) {
      const cm = mm / 10;
      expect(mmToLengthStep(lengthToMm(cm, 'cm'), 'cm')).toBe(cm);
    }
    for (let dag = 30; dag <= 3000; dag += 1) {
      const kg = dag / 100;
      expect(gramsToKgStep(kgToGrams(kg))).toBe(kg);
    }
  });
});

describe('temperature', () => {
  it('round-trips Fahrenheit to a tenth, which is the step', () => {
    for (const f of [97.5, 98.6, 99.1, 100.4, 102]) {
      expect(tempToDisplay(displayToTemp(f, 'f'), 'f')).toBeCloseTo(f, 1);
    }
  });

  it('round-trips Celsius', () => {
    for (const c of [36.5, 37, 38.2]) {
      expect(tempToDisplay(displayToTemp(c, 'c'), 'c')).toBeCloseTo(c, 1);
    }
  });

  it('gives Fahrenheit one decimal, so a 0.1 step is visible', () => {
    const a = displayToTemp(98.6, 'f');
    const b = displayToTemp(98.7, 'f');
    expect(tempToDisplay(a, 'f')).not.toBe(tempToDisplay(b, 'f'));
  });

  it('converts the two anchors correctly', () => {
    expect(tempToDisplay(0, 'f')).toBe(32);
    expect(tempToDisplay(10_000, 'c')).toBe(100);
    expect(tempToDisplay(3700, 'f')).toBe(98.6);
  });
});

describe('UNIT_LABEL', () => {
  it('has a suffix for every unit a stepper can show', () => {
    for (const u of ['oz', 'ml', 'kg', 'lb_oz', 'in', 'cm', 'f', 'c', 'min']) {
      expect(UNIT_LABEL[u]).toBeTruthy();
    }
  });

  it('carries no interpretation — a degree symbol, never a word like fever', () => {
    const all = Object.values(UNIT_LABEL).join(' ').toLowerCase();
    for (const banned of ['fever', 'high', 'low', 'normal', 'warning']) {
      expect(all).not.toContain(banned);
    }
  });
});
