import { describe, expect, it } from 'vitest';
import { hit, space, type as typeScale } from '../theme/theme';
import {
  BIG_STEPPER,
  canStep,
  COMPACT_STEPPER,
  CAPS_ADVANCE,
  compactValueWidth,
  labelWidth,
  createStepRepeater,
  decimalsOfStep,
  DURATION_UNIT_SCALE,
  formatStepValue,
  MONO_ADVANCE,
  MONO_LINE,
  parseAmount,
  parseMinutes,
  REPEAT_ACCELERATE_AFTER,
  REPEAT_FAST_MS,
  REPEAT_INITIAL_MS,
  repeatDelay,
  readoutKind,
  readoutText,
  readoutWidth,
  roundTo,
  sanitizeTyped,
  spokenReadout,
  spokenStepValue,
  STEP_GLYPH,
  stepGlyph,
  stepperBoxShape,
  stepReadout,
  stepValue,
  TYPED_BOX,
  typedA11yHint,
  typedBoxExtra,
  typedBoxHeight,
  typedEntryFor,
  typedHint,
  typedKeyboard,
  typedText,
  typedValue,
  unitCaseStyle,
  unitKeepsCase,
  wholeDigits,
  widestReadoutWidth,
  widestStepChars,
  type RepeatTimers,
} from './stepperMath';

/**
 * A clock the test moves by hand: `set` queues, `advance` runs whatever falls due, in order —
 * and it counts what is still pending, which is the number a leak shows up in.
 */
function fakeTimers(): RepeatTimers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let seq = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      seq += 1;
      queue.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear(handle) {
      queue.delete(handle as number);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...queue.entries()]
          .filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    pending: () => queue.size,
  };
}

describe('stepValue', () => {
  it('steps and rounds to the unit precision', () => {
    expect(stepValue(4, 0.5, 0, 12, 1)).toBe(4.5);
    expect(stepValue(0.1 + 0.2, 0.1, 0, 1, 1)).toBe(0.4);
    expect(stepValue(120, 10, 0, 400, 0)).toBe(130);
  });
  it('clamps at the bounds', () => {
    expect(stepValue(11.8, 0.5, 0, 12, 1)).toBe(12);
    expect(stepValue(0.2, -0.5, 0, 12, 1)).toBe(0);
    expect(stepValue(12, 0.5, 0, 12, 1)).toBe(12);
  });
  it('treats a non-number as the minimum rather than NaN', () => {
    expect(stepValue(Number.NaN, 1, 0, 10, 0)).toBe(1);
  });
});

describe('canStep', () => {
  it('is false exactly at the bound in that direction', () => {
    expect(canStep(12, 0.5, 0, 12)).toBe(false);
    expect(canStep(11.5, 0.5, 0, 12)).toBe(true);
    expect(canStep(0, -0.5, 0, 12)).toBe(false);
    expect(canStep(0.5, -0.5, 0, 12)).toBe(true);
    expect(canStep(5, 0, 0, 12)).toBe(false);
  });
});

describe('repeatDelay', () => {
  it('starts at 120 ms and accelerates to 60 ms after eight steps', () => {
    expect(repeatDelay(0)).toBe(REPEAT_INITIAL_MS);
    expect(repeatDelay(REPEAT_ACCELERATE_AFTER - 1)).toBe(120);
    expect(repeatDelay(REPEAT_ACCELERATE_AFTER)).toBe(REPEAT_FAST_MS);
    expect(repeatDelay(40)).toBe(60);
  });
});

describe('formatStepValue', () => {
  it('trims trailing zeros but keeps the precision the unit needs', () => {
    expect(formatStepValue(4, 1)).toBe('4');
    expect(formatStepValue(4.5, 1)).toBe('4.5');
    expect(formatStepValue(120, 0)).toBe('120');
    expect(formatStepValue(100, 1)).toBe('100');
    expect(formatStepValue(0, 1)).toBe('0');
    expect(formatStepValue(4.25, 2)).toBe('4.25');
    expect(formatStepValue(4.2, 2)).toBe('4.2');
    expect(formatStepValue(4.499999, 1)).toBe('4.5');
  });
  it('never shows NaN', () => {
    expect(formatStepValue(Number.NaN, 1)).toBe('0');
  });
});

/**
 * THE COMPACT STEPPER (the owner, 2026-09-26: *"(-) x oz (+) all in one row, and smaller than
 * current"*): smaller than both of the others, every target still a whole 44, and a number box
 * that never lets the − move under the thumb as the digits change.
 */
describe('the compact stepper', () => {
  /** Every value on a grid, as the stepper shows it. */
  const grid = (min: number, max: number, step: number): string[] => {
    const places = decimalsOfStep(step);
    const out: string[] = [];
    for (let v = min; v <= max + 1e-9; v = roundTo(v + step, places))
      out.push(formatStepValue(v, places));
    return out;
  };

  it('is smaller than the big stepper and the round one, and every target is still 44', () => {
    // the big one's squares are `hit.primary` and its value 27; the round one's circles 38 (34
    // narrow) and its value 21
    expect(COMPACT_STEPPER.circle).toBeLessThan(34);
    expect(COMPACT_STEPPER.circle).toBeLessThan(hit.primary);
    expect(COMPACT_STEPPER.value).toBeLessThan(21);
    expect(stepGlyph(COMPACT_STEPPER.circle).length).toBeLessThanOrEqual(
      COMPACT_STEPPER.circle * 0.6,
    );
    // each circle is drawn inside a whole target, so there is room round it for one
    expect(hit.min).toBeGreaterThanOrEqual(44);
    expect(hit.min).toBeGreaterThan(COMPACT_STEPPER.circle);
  });

  it('counts the widest number a range can show', () => {
    expect(widestStepChars(0, 17, 1)).toBe(4); // "16.5"
    expect(widestStepChars(0, 500, 0)).toBe(3); // "500"
    expect(widestStepChars(0, 9.5, 1)).toBe(3); // "9.5"
    expect(widestStepChars(-5, 5, 0)).toBe(2); // "-5"
    expect(widestStepChars(0, Number.NaN, 0)).toBe(1);
  });

  it('fits every number of the bottle’s grids in its box, so the − never moves', () => {
    // the leftover's two grids: halves of an ounce to 17, tens of milliliters to 500
    for (const [max, step] of [
      [17, 0.5],
      [500, 10],
      [12, 0.25],
      [60, 1],
    ] as const) {
      const widest = widestStepChars(0, max, decimalsOfStep(step));
      for (const shown of grid(0, max, step))
        expect(shown.length, shown).toBeLessThanOrEqual(widest);
      // and the widest really occurs, so the box is not wider than it needs to be
      expect(Math.max(...grid(0, max, step).map(s => s.length))).toBe(widest);
    }
  });

  it('makes the box as wide as the widest number in the mono face, the gap, and the unit', () => {
    const label = typeScale.label;
    // "OZ" in the label role: O and Z at Hanken Grotesk Bold's own widths, plus the tracking
    const unit = (0.747 + 0.605) * label.fontSize + 2 * label.letterSpacing;
    expect(labelWidth('oz')).toBeCloseTo(unit, 9);
    expect(compactValueWidth(0, 17, 1, 'oz')).toBe(
      Math.ceil(4 * MONO_ADVANCE * COMPACT_STEPPER.value + space.xs + unit),
    );
    // ml's widest number is a character shorter than an ounce's
    expect(compactValueWidth(0, 500, 0, 'ml')).toBeLessThan(compactValueWidth(0, 17, 1, 'oz'));
    // a unit is measured by its letters, not counted: "°F" is narrower than "OZ"
    expect(labelWidth('°F')).toBeLessThan(labelWidth('oz'));
  });

  /**
   * THE LABEL LEFT THE MONO FACE (2026-09-26, the owner: three faces in one section), so its
   * width is its letters'. Every capital is tabled, and a character that is not counts as the
   * widest the units use, so the box can come out too wide and never too narrow.
   */
  it('tables every capital, and counts an unknown character as M', () => {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ°') expect(CAPS_ADVANCE[c], c).toBeGreaterThan(0);
    expect(labelWidth('Ω')).toBeCloseTo(labelWidth('M'), 9);
    expect(
      Math.max(...['OZ', 'ML', 'MIN', 'CM', 'KG'].map(u => labelWidth(u) / u.length)),
    ).toBeLessThan(0.86 * typeScale.label.fontSize + typeScale.label.letterSpacing);
  });

  /**
   * "mL", NEVER "ML" (2026-09-26): a unit with a capital of its own is drawn as spelled; the rest
   * keep the label role's capitals. Measured in capitals either way, which is the wider of the two.
   */
  it('draws a unit with its own capitals as spelled, and every other unit in capitals', () => {
    expect(unitKeepsCase('mL')).toBe(true);
    expect(unitKeepsCase('L')).toBe(true);
    expect(unitKeepsCase('°F')).toBe(true);
    expect(unitKeepsCase('oz')).toBe(false);
    expect(unitKeepsCase('min')).toBe(false);
    expect(unitCaseStyle('mL')).toEqual({ textTransform: 'none' });
    expect(unitCaseStyle('oz')).toBeUndefined();
    // the box is measured in capitals, never narrower than the unit as drawn
    expect(labelWidth('mL')).toBe(labelWidth('ML'));
    // and a thousand milliliters fits the box a stepper keeps for its widest number
    expect(compactValueWidth(0, 1000, 0, 'mL')).toBe(
      Math.ceil(4 * MONO_ADVANCE * COMPACT_STEPPER.value + space.xs + labelWidth('ML')),
    );
  });
});

/**
 * AN HOUR AND MORE READS AS HOURS AND MINUTES (the owner, 2026-09-26: *"Minutes are typed as digits
 * only now: 80, not 1:20 … normally, 1h20m is easier to read for user"*). Typed and held in minutes;
 * shown the app's way.
 */
describe('stepReadout — what a stepper shows', () => {
  it('shows a length of an hour and more as hours and minutes, spelled as the app spells one', () => {
    const r = stepReadout(80, 0, 'min', 'minutes');
    expect(r.duration).toBe(true);
    expect(r.parts).toEqual([
      { number: '1', unit: 'h' },
      { number: '20', unit: 'm' },
    ]);
    expect(readoutText(r)).toBe('1h 20m');
    expect(readoutText(stepReadout(120, 0, 'min', 'minutes'))).toBe('2h');
    expect(readoutText(stepReadout(960, 0, 'min', 'minutes'))).toBe('16h');
    expect(readoutText(stepReadout(60, 0, 'min', 'minutes'))).toBe('1h');
    expect(readoutText(stepReadout(61, 0, 'min', 'minutes'))).toBe('1h 1m');
  });

  it('keeps today’s look under an hour, and for every amount', () => {
    expect(stepReadout(59, 0, 'min', 'minutes')).toEqual({
      parts: [{ number: '59', unit: 'min' }],
      duration: false,
    });
    expect(readoutText(stepReadout(45, 0, 'min', 'minutes'))).toBe('45 min');
    // an amount of 90 is ninety of its unit, never "1h 30m"
    expect(readoutText(stepReadout(90, 0, 'ml', 'amount'))).toBe('90 ml');
    expect(readoutText(stepReadout(5.25, 2, 'oz', 'amount'))).toBe('5.25 oz');
    // a count has no unit
    expect(readoutText(stepReadout(3, 0, '', 'amount'))).toBe('3');
  });

  it('knows a length by how it is typed, or — not typeable — by its unit', () => {
    expect(readoutKind({ title: 'Slept for', kind: 'minutes' }, 'min')).toBe('minutes');
    expect(readoutKind(undefined, 'min')).toBe('minutes');
    expect(readoutKind(undefined, ' MIN ')).toBe('minutes');
    expect(readoutKind(undefined, 'oz')).toBe('amount');
  });

  it('says hours and minutes as words to a screen reader', () => {
    expect(spokenReadout(stepReadout(80, 0, 'min', 'minutes'), 'minutes')).toBe(
      '1 hour 20 minutes',
    );
    expect(spokenReadout(stepReadout(121, 0, 'min', 'minutes'), 'minutes')).toBe(
      '2 hours 1 minute',
    );
    expect(spokenReadout(stepReadout(180, 0, 'min', 'minutes'), 'minutes')).toBe('3 hours');
    expect(spokenReadout(stepReadout(35, 0, 'min', 'minutes'), 'minutes')).toBe('35 minutes');
    expect(spokenReadout(stepReadout(4.5, 1, 'oz', 'amount'), 'amount')).toBe('4.5 oz');
  });

  it('measures the widest readout a range can show, so a box never moves as the number grows', () => {
    const size = COMPACT_STEPPER.value;
    // a pump's "How long" to two hours: "1h 59m" is wider than "59 MIN"
    const long = widestReadoutWidth(0, 120, 0, 'min', 'minutes', size);
    const short = widestReadoutWidth(0, 59, 0, 'min', 'minutes', size);
    expect(long).toBeGreaterThan(short);
    expect(long).toBe(
      Math.ceil(3 * MONO_ADVANCE * size + 3 * MONO_ADVANCE * size * DURATION_UNIT_SCALE),
    );
    // an amount is measured exactly as the compact box always measured it
    expect(widestReadoutWidth(0, 17, 1, 'oz', 'amount', size)).toBe(
      compactValueWidth(0, 17, 1, 'oz'),
    );
    expect(compactValueWidth(0, 120, 0, 'min', 'minutes')).toBe(long);
    // every readout a length range shows fits inside the width measured for it
    for (let m = 0; m <= 960; m += 1)
      expect(readoutWidth(stepReadout(m, 0, 'min', 'minutes'), size), `${m}`).toBeLessThanOrEqual(
        widestReadoutWidth(0, 960, 0, 'min', 'minutes', size),
      );
  });

  it('boxes a typeable number with a little air, and draws its focused edge inside it', () => {
    // no edge at rest: the box is its air (`typedBox.ts` has the soft fill that says "type here")
    expect(typedBoxExtra()).toBe(2 * TYPED_BOX.padX);
    // the focused edge fits inside the air either way, so a box that lights never grows
    expect(TYPED_BOX.focus).toBeLessThan(TYPED_BOX.padX);
    expect(TYPED_BOX.focus).toBeLessThan(TYPED_BOX.padY);
    // the box grows a compact row by a hair, and never past a target
    expect(COMPACT_STEPPER.value * 1.3 + 2 * TYPED_BOX.padY).toBeLessThan(hit.min);
  });
});

describe('roundTo / decimalsOfStep', () => {
  it('rounds through a power of ten', () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(7.6, 0)).toBe(8);
  });
  it('reads the decimals a step needs', () => {
    expect(decimalsOfStep(0.5)).toBe(1);
    expect(decimalsOfStep(0.25)).toBe(2);
    expect(decimalsOfStep(10)).toBe(0);
    expect(decimalsOfStep(1)).toBe(0);
  });
});

/**
 * HOLDING + OR − CHANGES THE VALUE CONTINUOUSLY (the owner, 2026-09-25), and stops the moment it
 * should: on release, at a bound, and when the control goes away mid-step.
 */
describe('createStepRepeater — the press and hold', () => {
  it('steps once at once, then every 120 ms, then every 60 ms after eight steps', () => {
    const timers = fakeTimers();
    const r = createStepRepeater(timers);
    let value = 0;
    r.start(() => {
      value += 1;
      return true;
    });
    // the hold was recognised: the first step is the one the tap would have made
    expect(value).toBe(1);
    timers.advance(REPEAT_INITIAL_MS - 1);
    expect(value).toBe(1);
    timers.advance(1);
    expect(value).toBe(2);
    // steps 2..8 at 120 ms, then the fast cadence
    timers.advance(REPEAT_INITIAL_MS * (REPEAT_ACCELERATE_AFTER - 2));
    expect(value).toBe(REPEAT_ACCELERATE_AFTER);
    timers.advance(REPEAT_FAST_MS);
    expect(value).toBe(REPEAT_ACCELERATE_AFTER + 1);
    timers.advance(REPEAT_FAST_MS * 10);
    expect(value).toBe(REPEAT_ACCELERATE_AFTER + 11);
    expect(r.running).toBe(true);
  });

  it('stops on release and leaves nothing scheduled', () => {
    const timers = fakeTimers();
    const r = createStepRepeater(timers);
    let value = 0;
    r.start(() => ++value > 0);
    timers.advance(REPEAT_INITIAL_MS * 3);
    r.stop();
    const at = value;
    timers.advance(10_000);
    expect(value).toBe(at);
    expect(timers.pending()).toBe(0);
    expect(r.running).toBe(false);
    // stopping again is harmless
    r.stop();
    expect(timers.pending()).toBe(0);
  });

  it('ends by itself at a bound: nothing is scheduled once the value stops moving', () => {
    const timers = fakeTimers();
    const r = createStepRepeater(timers);
    let value = 55;
    const max = 60;
    r.start(() => {
      if (value >= max) return false;
      value += 1;
      return true;
    });
    timers.advance(60_000);
    expect(value).toBe(max);
    expect(r.running).toBe(false);
    expect(timers.pending()).toBe(0);
  });

  it('a stop that lands while a step is running wins — an onChange that unmounts the stepper', () => {
    const timers = fakeTimers();
    const r = createStepRepeater(timers);
    let steps = 0;
    r.start(() => {
      steps += 1;
      if (steps === 3) r.stop();
      return true;
    });
    timers.advance(60_000);
    expect(steps).toBe(3);
    expect(timers.pending()).toBe(0);
  });

  it('a new hold replaces the old one: one timer at a time', () => {
    const timers = fakeTimers();
    const r = createStepRepeater(timers);
    let up = 0;
    let down = 0;
    r.start(() => ++up > 0);
    timers.advance(REPEAT_INITIAL_MS);
    r.start(() => ++down > 0);
    expect(timers.pending()).toBe(1);
    const before = up;
    timers.advance(REPEAT_INITIAL_MS * 4);
    expect(up).toBe(before);
    expect(down).toBe(5);
  });
});

/**
 * "MAKE 35 MIN TAPPABLE SO USERS CAN ENTER AN EXACT DURATION" (the owner, 2026-09-25): what a
 * parent may type, what it becomes, and that anything else changes nothing.
 */
describe('parseMinutes — a length as it is typed', () => {
  it('reads plain minutes, with or without the unit', () => {
    expect(parseMinutes('35')).toBe(35);
    expect(parseMinutes(' 90 ')).toBe(90);
    expect(parseMinutes('90m')).toBe(90);
    expect(parseMinutes('90 min')).toBe(90);
    expect(parseMinutes('90 minutes')).toBe(90);
    expect(parseMinutes('0')).toBe(0);
  });
  it('reads hours and minutes, as a clock or in words', () => {
    expect(parseMinutes('1:20')).toBe(80);
    expect(parseMinutes('0:45')).toBe(45);
    expect(parseMinutes('10:05')).toBe(605);
    expect(parseMinutes('1h')).toBe(60);
    expect(parseMinutes('1h 20m')).toBe(80);
    expect(parseMinutes('1h20')).toBe(80);
    expect(parseMinutes('2 hr 5 min')).toBe(125);
    expect(parseMinutes('1 Hour 30 Minutes')).toBe(90);
  });
  it('refuses anything it would have to guess at', () => {
    for (const bad of [
      '',
      '   ',
      '-5',
      '1.5',
      '4,5',
      'abc',
      '1:75',
      '1:5',
      '1h 75m',
      'h',
      '1:2:3',
    ]) {
      expect(parseMinutes(bad), bad).toBeNull();
    }
  });
});

describe('parseAmount — an amount as it is typed', () => {
  it('reads whole numbers and decimals, with a comma as the point', () => {
    expect(parseAmount('4')).toBe(4);
    expect(parseAmount('4.5')).toBe(4.5);
    expect(parseAmount('4,5')).toBe(4.5);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('4.')).toBe(4);
  });
  it('refuses negatives, words and two points', () => {
    for (const bad of ['', '-1', 'four', '4.5.1', '1e3', '4 oz']) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe('typedValue — what the stepper is set to', () => {
  it('is the typed length, exactly — not snapped to the five-minute step', () => {
    expect(typedValue('37', 'minutes', 0, 960, 0)).toBe(37);
    expect(typedValue('2:40', 'minutes', 0, 960, 0)).toBe(160);
  });
  it('clamps into the stepper’s range instead of refusing it', () => {
    expect(typedValue('2000', 'minutes', 0, 960, 0)).toBe(960);
    expect(typedValue('20:00', 'minutes', 0, 960, 0)).toBe(960);
    expect(typedValue('0', 'minutes', 5, 120, 0)).toBe(5);
  });
  it('keeps an amount to the stepper’s precision', () => {
    expect(typedValue('4.25', 'amount', 0, 12, 1)).toBe(4.3);
    expect(typedValue('4,5', 'amount', 0, 12, 1)).toBe(4.5);
    expect(typedValue('125', 'amount', 0, 400, 0)).toBe(125);
    expect(typedValue('13', 'amount', 0, 12, 1)).toBe(12);
  });
  it('is null — and the stepper keeps its value — for empty or unreadable input', () => {
    expect(typedValue('', 'minutes', 0, 960, 0)).toBeNull();
    expect(typedValue('soon', 'minutes', 0, 960, 0)).toBeNull();
    expect(typedValue('1.5', 'minutes', 0, 960, 0)).toBeNull();
    expect(typedValue('-2', 'amount', 0, 12, 1)).toBeNull();
  });
  it('opens on the number exactly as the stepper shows it', () => {
    expect(typedText(35, 0)).toBe('35');
    expect(typedText(4.5, 1)).toBe('4.5');
    expect(typedText(4, 1)).toBe('4');
  });
});

describe('spokenStepValue', () => {
  it('says a length in words, so "min" is never read as "minimum"', () => {
    expect(spokenStepValue('35', 'min', 'minutes')).toBe('35 minutes');
    expect(spokenStepValue('1', 'min', 'minutes')).toBe('1 minute');
    expect(spokenStepValue('4.5', 'oz', 'amount')).toBe('4.5 oz');
    expect(spokenStepValue('4.5', 'oz')).toBe('4.5 oz');
  });

  it('says a number with no unit as the number, never with a space after it', () => {
    expect(spokenStepValue('3', '', 'count')).toBe('3');
    expect(spokenStepValue('3', '')).toBe('3');
  });
});

/**
 * A COUNT (2026-09-30, "How many bottles" over a ruler from one to six): a whole number, its word
 * the caption's, typed on the number pad and said with the range as bare numbers.
 */
describe('a count, typed', () => {
  it('is whole, inside its range, and on the number pad', () => {
    expect(typedValue('3', 'count', 1, 6, 0)).toBe(3);
    expect(typedValue('9', 'count', 1, 6, 0)).toBe(6);
    expect(typedValue('0', 'count', 1, 6, 0)).toBe(1);
    expect(typedValue('2.6', 'count', 1, 6, 0)).toBe(3);
    expect(typedValue('', 'count', 1, 6, 0)).toBeNull();
    expect(sanitizeTyped('2.5', 'count', 0, wholeDigits(6))).toBe('2');
    expect(typedKeyboard('count', 0)).toBe('number-pad');
  });

  it('says its range as bare numbers, and what a double tap does', () => {
    expect(typedHint('count', 1, 6, 0, '')).toBe('From 1 to 6.');
    // even handed a unit, a count's range is the numbers: the word is on the caption
    expect(typedHint('count', 1, 4, 0, 'bottles')).toBe('From 1 to 4.');
    expect(typedHint('amount', 0, 34, 2, 'oz')).toBe('Up to 34 oz.');
    expect(typedA11yHint('count')).toBe('Double tap to type an exact number');
    expect(typedA11yHint('amount')).toBe('Double tap to type an exact amount');
    expect(typedA11yHint('minutes')).toBe('Double tap to type an exact length');
  });

  it('reads as the bare number, in a box as wide as one digit', () => {
    const r = stepReadout(3, 0, '', 'count');
    expect(r).toEqual({ parts: [{ number: '3', unit: '' }], duration: false });
    expect(readoutText(r)).toBe('3');
    expect(spokenReadout(r, 'count')).toBe('3');
    expect(widestReadoutWidth(1, 6, 0, '', 'count', 30)).toBe(Math.ceil(MONO_ADVANCE * 30));
  });
});

/**
 * ONLY A NUMBER IS EVER IN THE FIELD (the owner, 2026-09-26: *"users must be able to enter only
 * numerical value … instead of 5.5oz, user can type 5.25oz when they click the number"*).
 */
describe('sanitizeTyped — what a field keeps of a keystroke', () => {
  it('keeps digits and one point, two places for a quarter ounce', () => {
    expect(sanitizeTyped('5.25', 'amount', 2)).toBe('5.25');
    expect(sanitizeTyped('5.25oz', 'amount', 2)).toBe('5.25');
    expect(sanitizeTyped('5.256', 'amount', 2)).toBe('5.25');
    expect(sanitizeTyped('5.2.5', 'amount', 2)).toBe('5.25');
    expect(sanitizeTyped('.5', 'amount', 2)).toBe('.5');
    expect(sanitizeTyped('5.', 'amount', 2)).toBe('5.');
  });

  it('takes a comma as the point, and writes it as one', () => {
    expect(sanitizeTyped('4,5', 'amount', 2)).toBe('4.5');
    expect(sanitizeTyped('4,5,6', 'amount', 2)).toBe('4.56');
  });

  it('drops everything that is not a number: letters, signs, spaces', () => {
    for (const [typed, kept] of [
      ['abc', ''],
      ['-3', '3'],
      ['4 oz', '4'],
      ['1e3', '13'],
      ['+2', '2'],
      [' 7 ', '7'],
    ] as const)
      expect(sanitizeTyped(typed, 'amount', 2), typed).toBe(kept);
  });

  it('keeps milliliters, counts and minutes whole: no point at all', () => {
    expect(sanitizeTyped('125.5', 'amount', 0)).toBe('1255');
    expect(sanitizeTyped('45', 'minutes', 0)).toBe('45');
    expect(sanitizeTyped('1:20', 'minutes', 0)).toBe('120');
    expect(sanitizeTyped('1h 20m', 'minutes', 0)).toBe('120');
    // a length never has places, whatever precision is passed
    expect(sanitizeTyped('12.5', 'minutes', 2)).toBe('125');
  });

  it('stops at as many whole digits as the largest number has', () => {
    expect(wholeDigits(34)).toBe(2);
    expect(wholeDigits(960)).toBe(3);
    expect(wholeDigits(1000)).toBe(4);
    expect(wholeDigits(33.75)).toBe(2);
    expect(sanitizeTyped('999', 'amount', 2, wholeDigits(34))).toBe('99');
    expect(sanitizeTyped('99.75', 'amount', 2, wholeDigits(34))).toBe('99.75');
  });
});

describe('typedValue — a typed amount lands on its grid', () => {
  it('puts a quarter-ounce amount on the quarter, and says so as the field closes', () => {
    expect(typedValue('5.25', 'amount', 0, 34, 2, 0.25)).toBe(5.25);
    expect(typedValue('5.13', 'amount', 0, 34, 2, 0.25)).toBe(5.25);
    expect(typedValue('5.1', 'amount', 0, 34, 2, 0.25)).toBe(5);
    expect(typedValue('.5', 'amount', 0, 34, 2, 0.25)).toBe(0.5);
    expect(typedValue('40', 'amount', 0, 34, 2, 0.25)).toBe(34);
  });

  it('puts milliliters on the five', () => {
    expect(typedValue('123', 'amount', 0, 1000, 0, 5)).toBe(125);
    expect(typedValue('120', 'amount', 0, 1000, 0, 5)).toBe(120);
  });

  it('never snaps a length: an exact 37 minutes is the point', () => {
    expect(typedValue('37', 'minutes', 0, 960, 0, 5)).toBe(37);
  });

  it('keeps a bound that is off the grid reachable, and measures the grid from the start', () => {
    // a split bounded by a 3.7 oz bag
    expect(typedValue('3.7', 'amount', 0, 3.7, 2, 0.25)).toBe(3.7);
    // a thermometer from 95 °F in tenths
    expect(typedValue('99.14', 'amount', 95, 106, 1, 0.1)).toBe(99.1);
  });
});

describe('the keypad and the default entry', () => {
  it('offers a point only where the number has places', () => {
    expect(typedKeyboard('amount', 2)).toBe('decimal-pad');
    expect(typedKeyboard('amount', 1)).toBe('decimal-pad');
    expect(typedKeyboard('amount', 0)).toBe('number-pad');
    expect(typedKeyboard('minutes', 0)).toBe('number-pad');
  });

  it('types every stepper by default, named as it is captioned, a length by its unit', () => {
    expect(
      typedEntryFor({
        typeable: undefined,
        caption: 'Slept for',
        accessibilityLabel: 'x',
        unitLabel: 'min',
      }),
    ).toEqual({ title: 'Slept for', kind: 'minutes' });
    expect(
      typedEntryFor({ typeable: undefined, accessibilityLabel: 'Amount', unitLabel: 'oz' }),
    ).toEqual({ title: 'Amount', kind: 'amount' });
    expect(
      typedEntryFor({ typeable: false, accessibilityLabel: 'Amount', unitLabel: 'oz' }),
    ).toBeUndefined();
    const own = { title: 'Left minutes', kind: 'minutes' as const };
    expect(typedEntryFor({ typeable: own, accessibilityLabel: 'Left', unitLabel: 'min' })).toBe(
      own,
    );
  });
});

/**
 * ONE FAMILY OF STEPPERS (the owner, 2026-09-30, over the pump's LEFT, RIGHT and TOTAL: *"Did the
 * grey highlight box look okay to you? And the icon plus and minus is not exactly on the aligned in
 * the middle of the border. This is very bad and need fixing."*). The marks are drawn, their centers
 * the circles' own by arithmetic, and the typed box is as tall as the circles beside it. The source
 * side, that no stepper sets a text "+" or "−" any more, is `stepperWiring.test.ts`.
 */
describe('the − and + are drawn at the circle’s center', () => {
  /** Every circle a stepper draws: the primary number's, the pair's and its narrow one, the row's. */
  const CIRCLES = [BIG_STEPPER.circle, 38, 34, COMPACT_STEPPER.circle];

  it('centers the bar and the post on the circle, both ways, on every stepper', () => {
    for (const box of CIRCLES) {
      const g = stepGlyph(box);
      // the bar's middle and the post's middle are the circle's middle, to the point
      expect(g.bar.left + g.length / 2, `${box} bar across`).toBe(box / 2);
      expect(g.bar.top + g.thickness / 2, `${box} bar down`).toBe(box / 2);
      expect(g.post.left + g.thickness / 2, `${box} post across`).toBe(box / 2);
      expect(g.post.top + g.length / 2, `${box} post down`).toBe(box / 2);
      // and the plus is square: its two bars the same length and weight
      expect(g.post.left - g.bar.left).toBe(g.bar.top - g.post.top);
      // inside the circle with room to spare: the ends of a bar are inside its round edge
      const reach = Math.hypot(g.length / 2, g.thickness / 2);
      expect(reach, `${box} reach`).toBeLessThan(box / 2 - 4);
    }
  });

  it('weighs what the h2 face’s own plus weighed, and never thinner than two points', () => {
    expect(stepGlyph(38)).toMatchObject({ length: 14, thickness: 2.5 });
    expect(stepGlyph(COMPACT_STEPPER.circle)).toMatchObject({ length: 12, thickness: 2 });
    expect(stepGlyph(BIG_STEPPER.circle)).toMatchObject({ length: 20, thickness: 3.5 });
    for (const box of CIRCLES)
      expect(stepGlyph(box).thickness).toBeGreaterThanOrEqual(STEP_GLYPH.minThickness);
  });
});

describe('the typed box is exactly as tall as the circles beside it', () => {
  it('takes the circle’s height, as a pill, on every stepper', () => {
    for (const circle of [BIG_STEPPER.circle, 38, 34, COMPACT_STEPPER.circle]) {
      const shape = stepperBoxShape(circle);
      expect(shape.height).toBe(circle);
      // no corner of its own: the pill radius, which React Native holds to half the height
      expect(shape.radius).toBeUndefined();
    }
  });

  it('is drawn at the circles’ height at the phone’s own text size, the number inside it', () => {
    // each stepper's number at its size, in the mono face's line, fits inside its circles' height,
    // so the box is drawn at exactly that height
    for (const [circle, value] of [
      [BIG_STEPPER.circle, BIG_STEPPER.value],
      [38, 21],
      [34, 21],
      [COMPACT_STEPPER.circle, COMPACT_STEPPER.value],
    ] as const) {
      expect(value * MONO_LINE, `${value} pt in ${circle}`).toBeLessThan(circle);
      expect(typedBoxHeight(circle, value, 1)).toBe(circle);
      expect(typedBoxHeight(circle, value, 1.2)).toBe(circle);
    }
    // and at the largest chrome size it grows round the number rather than clip it
    expect(typedBoxHeight(38, 21, 3)).toBeCloseTo(21 * 1.6 * MONO_LINE, 6);
    expect(typedBoxHeight(38, 21, 3)).toBeGreaterThan(38);
  });
});
