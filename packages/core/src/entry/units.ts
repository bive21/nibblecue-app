/**
 * Display units and the stepper table (PRODUCT_SPEC.md §5.2, §13; docs/plans/WP5.md WP5.2).
 *
 * Storage is canonical and never changes: ml, g, mm, °C×100, minutes. Weight, length and
 * temperature follow the viewer's own `profiles.weight_unit | length_unit | temp_unit`. The
 * VOLUME is the household's (`household_settings.volume_unit`, migration 0128; the owner,
 * 2026-09-26: *"make the oz/mL setting household-wide, not per person"*): every phone in a
 * household reads milk in the same unit, so a bottle one parent logged in mL is the number the
 * other reads. Switching a unit re-renders and rewrites no stored amount.
 *
 * THE RULE THAT DECIDES WHERE THE CONVERSION LIVES: a stepper must be exactly reversible.
 * Tap `+` then `−` and you must be back where you started, every time, or a parent adjusting
 * an amount at 3 a.m. watches it drift. 0.5 oz is 14.7867… ml, so a stepper that converted on
 * every tap would round-trip through an integer ml and lose a little each way.
 *
 * So the value a sheet holds while it is open is in DISPLAY units, stepping is exact
 * arithmetic there, and the conversion to canonical happens ONCE, on save. Loading an entry
 * to edit converts the other way, once. Everything between is closed under +/- step.
 */

// Re-exported, never redefined. domain-types.ts already owns the constant AND the four unit
// unions; a second copy of any of them would collide on the barrel and, worse, could drift
// from the CHECK constraints in 0001_init.sql that these unions mirror.
import type { LengthUnit, TempUnit, VolumeUnit, WeightUnit } from '../domain/domain-types';
import { ML_PER_OZ } from '../domain/domain-types';

export { ML_PER_OZ };
export type { LengthUnit, TempUnit, VolumeUnit, WeightUnit };

const G_PER_OZ = 28.349523125;
const MM_PER_IN = 25.4;

export interface UnitPrefs {
  volume: VolumeUnit;
  weight: WeightUnit;
  length: LengthUnit;
  temp: TempUnit;
}

/** The column defaults in `0001_init.sql`, so a profile that has never been edited agrees. */
export const DEFAULT_UNITS: UnitPrefs = { volume: 'oz', weight: 'lb_oz', length: 'in', temp: 'f' };

/**
 * The step for each quantity, in its DISPLAY unit (PRODUCT_SPEC.md §5.2).
 *
 * `sleep` is five minutes and `minutes` is one: a nap is estimated to the nearest five, a
 * tummy-time session is counted. They are separate entries in the table rather than one
 * "minutes" step with a caller-supplied override, because an override is a thing to get
 * wrong at one call site and never notice.
 */
export const STEP: Readonly<Record<string, number>> = {
  /**
   * A QUARTER OUNCE, AND FIVE MILLILITERS (the owner, 2026-09-26: *"instead of 5.5oz, user can type
   * 5.25oz when they click the number"*). The grid was half an ounce and ten milliliters while the
   * only way to reach a number was a tap per step; now an amount is dragged along a ruler or typed
   * (`NumberRuler`, `StepperEntry`), and the step is how finely either lands, not how many taps a
   * number costs. A quarter ounce is what a parent reads off a storage bag's marks between the half
   * ounces; five milliliters is the same fineness for an ml reader. Every sheet puts its amounts on
   * this grid (`toDisplay`, `snapToStep`), so a typed 5.25 is shown and saved as 5.25 — 155 ml,
   * `volumeToMl`'s arithmetic, exactly what any other surface would compute from it.
   */
  volume_oz: 0.25,
  volume_ml: 5,
  minutes: 1,
  // one minute a tap, as every other length (the owner, 2026-10-06: "sleeping increment per + or -
  // is 5 minutes, it should be just one minute per click")
  sleep_minutes: 1,
  weight: 0.1,
  temp: 0.1,
  length: 0.25,
  /**
   * THE METRIC GRIDS, which §5.2's table did not name until 2026-09-25 (it gave 0.1 for weight
   * and 0.25 in for length, and both were being applied to kg and cm as they stood). The audit of
   * 2026-09-24 found what that did: a 0.25 step under a display rounded to 0.1 cm moved +0.3 then
   * −0.2 per tap, and 0.1 kg is 100 g — a clinic's 4.53 kg could not be entered. A tenth of a
   * centimetre and ten grams are what a clinic's tape and scale read. (The Log's edit sheet kept
   * the tenth of a kilogram until 2026-09-25; it reads `weightStep` now.)
   */
  weight_kg: 0.01,
  length_cm: 0.1,
};

/** The step for a volume stepper in the viewer's unit. */
export const volumeStep = (unit: VolumeUnit): number =>
  unit === 'ml' ? STEP.volume_ml! : STEP.volume_oz!;

/**
 * HOW FAR ONE TAP MOVES A VOLUME THAT HAS NO RULER (2026-09-26): half an ounce, or ten
 * milliliters — the pump's left, right and total, which stand as round pairs. The grid went to a
 * quarter ounce so that a typed 5.25 stays 5.25 (`volumeStep`), but a pair has no strip to drag,
 * and a tap per quarter doubled the taps to a pump's 4 oz: the repetition the owner asked to be rid
 * of (*"feel very repetitive"*). So a tap moves as far as it always did, and the number still takes
 * a quarter when it is typed. A ruler's own − and + keep the quarter: there the drag does the
 * distance and the buttons are the fine tune.
 */
export const volumeTapStep = (unit: VolumeUnit): number => (unit === 'ml' ? 10 : 0.5);

/** The step for a length stepper: a quarter inch, or a millimetre. */
export const lengthStep = (unit: LengthUnit): number =>
  unit === 'cm' ? STEP.length_cm! : STEP.length!;

/** The step for a weight stepper: ten grams in kg; a tenth of an ounce beside the pounds. */
export const weightStep = (unit: WeightUnit): number =>
  unit === 'kg' ? STEP.weight_kg! : STEP.weight!;

/**
 * A value moved onto its stepper's grid. A stepper adds its step to whatever it is showing, so a
 * value that STARTS off the grid stays off it for ever — 19.69 in stepped by a quarter is 19.94,
 * 20.19, and 20 can never be reached (the audit of 2026-09-24). Every pre-fill goes through this
 * once, when the sheet opens.
 */
export function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) return value;
  return Math.round(Math.round(value / step) * step * 10_000) / 10_000;
}

/**
 * A STEPPER TAP FROM A VALUE OFF ITS GRID LANDS ON THE GRID — the other half of `snapToStep`, for
 * a stepper that shows a SAVED value exactly rather than snapping it when it opens. The Log's edit
 * sheet shows a 110 ml bottle as 3.7 oz, and so does a stash container's "Correct the amount"; a
 * stepper that then moved by its step from there would show 4.2, 4.7… and never the 4 oz the parent
 * meant. So the first tap goes to the next grid point in its direction (3.7 → 4.0 or 3.5), and
 * every tap after that is exact. Clamped to the stepper's bounds, as the stepper itself clamps.
 * (Moved here from the edit sheet's `editor.ts` on 2026-09-25, when the stash sheets took it up.)
 *
 * ONLY A TAP IS RE-AIMED (2026-09-26). A number can now be SET outright — dragged to on the ruler,
 * or typed — and such a value is already where the parent put it: re-aiming it as if it were one
 * step would turn a typed 5.25 into 3.75, the grid point one step from 3.7. So a change that is not
 * exactly one step away is kept as it is, clamped. (A set value is on the grid and an off-grid
 * `shown` is not, so the two can never be exactly one step apart by accident.)
 */
export function gridTap(
  shown: number,
  next: number,
  step: number,
  min: number,
  max: number,
): number {
  const k = shown / step;
  const clamp = (v: number): number => Math.min(max, Math.max(min, v));
  if (Math.abs(k - Math.round(k)) < 1e-6) return next;
  if (Math.abs(Math.abs(next - shown) - step) > 1e-6) return clamp(next);
  const snapped = next > shown ? Math.ceil(k) * step : Math.floor(k) * step;
  return clamp(Math.round(snapped * 10_000) / 10_000);
}

/** Stored mm to a length stepper's value: the display unit, on its grid. */
export const mmToLengthStep = (mm: number, unit: LengthUnit): number =>
  snapToStep(unit === 'cm' ? mm / 10 : mm / MM_PER_IN, lengthStep(unit));

/** Stored grams to a kg stepper's value, on its ten-gram grid. */
export const gramsToKgStep = (g: number): number => snapToStep(g / 1000, STEP.weight_kg!);

/**
 * Clamp a stepped value at zero and round away float noise.
 *
 * `0.1 + 0.2` is `0.30000000000000004`, and a stepper that showed that once would be a
 * stepper nobody trusted again. Four decimal places is far finer than any step in the table
 * and coarse enough to erase the artifact.
 */
export function stepValue(current: number, delta: number, step: number): number {
  const next = current + delta * step;
  return next <= 0 ? 0 : Math.round(next * 10_000) / 10_000;
}

/** A number to at most `places` decimals, trailing zeros trimmed: `14.25`, `14.5`, `14`. */
const plain = (value: number, places: number): string => String(Number(value.toFixed(places)));

/* ---------------------------------------------------------------- volume */

/** Display volume to stored ml. Rounded to an integer: `bottle_details.consumed_ml` is an int. */
export const volumeToMl = (value: number, unit: VolumeUnit): number =>
  Math.round(unit === 'ml' ? value : value * ML_PER_OZ);

/**
 * Stored ml to the display unit: the number a stepper holds and the number a label writes.
 *
 * OUNCES ARE READ ON THE QUARTER-OUNCE GRID THEY ARE TYPED ON (the owner, 2026-09-26: *"i added
 * 7.25oz from existing 7oz stash, on the main page it shows as total 14.3 oz … surely it can fit
 * an extra digit?"*). This used to round ounces to one decimal, so 7 + 7.25 — stored as 207 +
 * 214 ml — read back as "14.3 oz", a number nobody entered. It was never a lack of room.
 *
 * Every amount is typed on the quarter ounce (`STEP.volume_oz`), and stored as whole ml. Rounding
 * the ml back to hundredths of an ounce would not undo that: 421 ml is 14.2357 oz, and "14.24"
 * is as wrong as "14.3". So an ounce amount is put back ON THE GRID — the nearest quarter — which
 * is exact for anything typed on it. An amount that was never on the grid (an ml reader's 110 ml,
 * a week's average) reads as the nearest quarter, never more than an eighth of an ounce away —
 * less than one step of the stepper that would enter it. Up to two decimals, trailing zeros
 * trimmed: 14.25, 14.5, 14.
 *
 * A SUM IS NOT SNAPPED BACK BY THIS ALONE, however: each amount's storage rounds by up to half a
 * ml, the same way every time for the same amount, and a quarter ounce is only 7.4 ml. A total
 * of stored ml drifts a quarter off after a handful of rows — nine 1 oz bottles are 270 ml,
 * "9.25 oz". A total a parent reads is added up with `volumeAsRead` below.
 *
 * Milliliters are whole: nobody measures a feed to a tenth of a ml. A LABEL writes a thousand and
 * more in liters (`volumeText`); a stepper keeps milliliters, so its number is always "1000".
 */
export const mlToVolume = (ml: number, unit: VolumeUnit): number =>
  unit === 'ml' ? Math.round(ml) : snapToStep(ml / ML_PER_OZ, STEP.volume_oz!);

/**
 * STORED ML AS THE AMOUNT ITS LABEL NAMES, in ml (the owner, 2026-10-02: a 9 oz pump split into
 * three frozen bottles all said "3 oz", then a bottle from the stash logged 2.75 oz).
 *
 * A split's last container takes the session's few leftover ml (`evenSplit`): 9 oz in three is
 * 89 + 89 + 88. All three READ as "3 oz" on the quarter grid, but 88 ml is shy of a true 3 oz
 * (89 ml). The largest grid amount that still fits in 88 ml is 2.75 oz (81 ml) — so a pour that
 * "stayed inside the bag" on the stepper's grid would log 2.75 while the stash still said 3.
 *
 * This is the labeled amount as ml: what `volumeText` names, converted back once. A pour of that
 * bag opens and saves as 3 oz (89 ml); the draw takes the 88 ml that are there. Milliliters are
 * already whole, so they pass through unchanged.
 */
export const asLabeledMl = (ml: number, unit: VolumeUnit): number =>
  volumeToMl(mlToVolume(ml, unit), unit);

/**
 * AN AMOUNT AS IT COUNTS IN A TOTAL READ IN `unit`, in ml: what one row adds to a figure that adds
 * rows up (the pre-launch sweep, 2026-09-27).
 *
 * The owner's 7 oz + 7.25 oz read "14.3 oz" (2026-09-26); reading ounces on the quarter grid fixed
 * a sum of two, not a sum of many. Every amount is stored as whole ml, and the same amount rounds
 * the same way every time — 1 oz is kept as 30 ml (+0.43), 4 oz as 118 (−0.29), 3.5 oz as 104
 * (+0.49) — so a sum of stored ml drifts by up to half a ml per row, and a quarter ounce is 7.4 ml.
 * A newborn's nine 1 oz bottles were 270 ml, and Today's Feeding read "9.25 oz"; a freezer of
 * thirteen 4 oz bags was 1534 ml, "51.75 oz"; eight 3.5 oz bags "28.25 oz". The formatter cannot
 * know how many amounts a sum holds, so no snapping of the SUM can undo it.
 *
 * So a total read in ounces adds up its amounts AS THEY READ: each one on its quarter, in ml, and
 * the figure is the sum of what the rows say — exactly what a parent adding up the Log gets, the
 * rule breastfeeding's minutes already follow (`todayTotals`). A total in milliliters is the plain
 * sum: each row reads its stored ml. The result is ml, for the one formatter (`volumeText`), and
 * within half a ml per row of the stored sum.
 */
export const volumeAsRead = (ml: number, unit: VolumeUnit): number =>
  unit === 'oz' ? mlToVolume(ml, 'oz') * ML_PER_OZ : ml;

/** Amounts added up as they read in `unit` (`volumeAsRead`), in ml. */
export const volumeSum = (mls: Iterable<number>, unit: VolumeUnit): number => {
  let sum = 0;
  for (const ml of mls) sum += volumeAsRead(ml, unit);
  return sum;
};

/**
 * THE SYMBOLS A VOLUME IS WRITTEN IN (the owner, 2026-09-26: *"perhaps 1000mL show as 1L 1250mL
 * show as 1.25L etc. therefore the digit stays maximum 3 or 4"*): `oz`, `mL` and `L` — never "ml",
 * which is how the unit is STORED (`VolumeUnit`), not how a person reads it. A milliliter amount
 * under a thousand is whole ("120 mL"); a thousand and above is liters with up to two decimals,
 * trailing zeros trimmed ("1 L", "1.25 L", "2.4 L"), so a number never runs past four digits. An
 * ounce amount stays in ounces whatever its size — "184.5 oz" is how a US freezer is counted.
 */
export type VolumeSymbol = 'oz' | 'mL' | 'L';

/** A liter, in the ml every amount is stored in. */
const ML_PER_LITER = 1000;

/** The symbol one amount is written in, in the household's unit. */
export function volumeSymbol(ml: number, unit: VolumeUnit): VolumeSymbol {
  if (unit === 'oz') return 'oz';
  return Math.abs(Math.round(Number.isFinite(ml) ? ml : 0)) >= ML_PER_LITER ? 'L' : 'mL';
}

/**
 * THE SYMBOL A ROW OF AMOUNTS SHARES, where the unit is said once for all of them — the stash's
 * `4 + 4 oz`, its week's legend beside `oz net`. Each amount on its own would pick its own symbol,
 * and "900 + 1.2" under one "L" would read as 900 liters; so the largest decides for the row, and
 * a row that reaches a liter is written in liters throughout ("0.9 + 1.2 L").
 */
export function sharedVolumeSymbol(mls: readonly number[], unit: VolumeUnit): VolumeSymbol {
  if (unit === 'oz') return 'oz';
  return mls.some(ml => volumeSymbol(ml, unit) === 'L') ? 'L' : 'mL';
}

/**
 * An amount's number in a given symbol, as it is written: `14.25`, `120`, `1.25`. A negative amount
 * keeps its sign as a real minus (U+2212), and anything that rounds to nothing is a plain `0`.
 */
export function volumeNumber(ml: number, symbol: VolumeSymbol): string {
  const v = Number.isFinite(ml) ? ml : 0;
  const abs = Math.abs(v);
  const n =
    symbol === 'oz'
      ? plain(mlToVolume(abs, 'oz'), 2)
      : symbol === 'L'
        ? plain(Math.round(abs) / ML_PER_LITER, 2)
        : String(Math.round(abs));
  return n === '0' || v >= 0 ? n : `−${n}`;
}

/** One amount as its number and its symbol, for a figure drawn apart from its unit. */
export function volumeParts(ml: number, unit: VolumeUnit): { number: string; unit: VolumeSymbol } {
  const symbol = volumeSymbol(ml, unit);
  return { number: volumeNumber(ml, symbol), unit: symbol };
}

/**
 * THE SAME AMOUNT IN FEWER DIGITS, for a figure with no room for its quarter (2026-09-26). Today's
 * report draws a volume in it only where the exact figure would be drawn under the report's figure
 * floor — the design system decides where (`statFigureLine`) — and every other phone, every spoken
 * label and every text keeps the exact amount (`volumeText`). It was made for a mixed-feeding day's
 * ounces and minutes at the breast on one line, "29.75 oz · 3h 45m" on the narrowest phone; since the
 * two have a line each (2026-09-27) no figure the report draws needs it, and it stays for a volume
 * that ever would.
 *
 *   * OUNCES TO THE WHOLE OUNCE: the quarter the exact figure writes, rounded as a person rounds it
 *     (29.75 → 30, 14.5 → 15, 14.25 → 14), so a phone that shows the quarter and one that cannot
 *     read as one number and its rounding. An amount UNDER ONE OUNCE that is not nothing is "<1":
 *     never "0", which would read as no milk at all, and never "1", which a newborn's quarter-ounce
 *     top-up is not.
 *   * LITERS TO ONE DECIMAL: 1.25 L → 1.3 L.
 *   * MILLILITERS are whole already, and have no shorter form.
 *
 * Null where the short form would be the exact one ("30 oz", "120 mL", "1.2 L") — there is nothing to
 * choose between — and for a difference, which can be negative: only an amount is shortened.
 */
export function volumeShortParts(
  ml: number,
  unit: VolumeUnit,
): { number: string; unit: VolumeSymbol } | null {
  if (!Number.isFinite(ml) || ml < 0) return null;
  const exact = volumeParts(ml, unit);
  let number = exact.number;
  if (exact.unit === 'oz') {
    const oz = mlToVolume(ml, 'oz');
    number = oz > 0 && oz < 1 ? '<1' : String(Math.round(oz));
  } else if (exact.unit === 'L') {
    // whole ml, then tenths of a liter in integers: 1150 ml is 1.2 L, where `toFixed(1)` of the
    // float 1.15 says 1.1
    number = String(Math.round(Math.round(ml) / 100) / 10);
  }
  return number === exact.number ? null : { number, unit: exact.unit };
}

/**
 * ONE AMOUNT AS A PARENT READS IT: `14.25 oz`, `120 mL`, `1.25 L`. The one place a volume is
 * written for a person — the sheets' toasts, Today, the stash, the Log, Reports, the visit
 * summary, the widgets and the push text all come here (`volume.scan.test.ts` in the app holds
 * the rest of the code to it). An export's canonical column is not a display and stays in ml.
 */
export const volumeText = (ml: number, unit: VolumeUnit): string => {
  const p = volumeParts(ml, unit);
  return `${p.number} ${p.unit}`;
};

/* ---------------------------------------------------------------- weight */

export interface LbOz {
  lb: number;
  oz: number;
}

/** Stored grams to pounds and ounces, the way a US scale reads. */
export function gramsToLbOz(g: number): LbOz {
  const totalOz = g / G_PER_OZ;
  let lb = Math.floor(totalOz / 16);
  let oz = Math.round((totalOz - lb * 16) * 10) / 10;
  // rounding can carry: 7 lb 15.97 oz is 8 lb, not 7 lb 16.0 oz
  if (oz >= 16) {
    lb += 1;
    oz = 0;
  }
  return { lb, oz };
}

export const lbOzToGrams = (v: LbOz): number => Math.round((v.lb * 16 + v.oz) * G_PER_OZ);

export const gramsToKg = (g: number): number => Math.round((g / 1000) * 100) / 100;
export const kgToGrams = (kg: number): number => Math.round(kg * 1000);

/* ---------------------------------------------------------------- length */

export const lengthToMm = (value: number, unit: LengthUnit): number =>
  Math.round(unit === 'cm' ? value * 10 : value * MM_PER_IN);

/* ----------------------------------------------------------------- labels */

/**
 * ONE SPELLING PER MEASUREMENT, wherever a parent or a clinician reads it: the Log row, the save
 * toast, Reports, the growth history and the visit summary (the owner, 2026-09-24: "precise enough
 * to not let this happen"). Each screen used to format for itself. A length is stored in whole
 * millimetres, so 22 in is kept as 559 mm, which is 22.008 in. The Log row printed two places,
 * "22.01 in", and Reports printed one, "22.0 in". One measurement had three spellings, and none of
 * them was the "22" the parent had entered.
 *
 * A measurement is written on its stepper's grid, the way the stepper showed it
 * (`formatStepValue`: no trailing zeros), so a length reads as it was entered:
 *   * a quarter inch: 22 in, 22.25 in. Half a millimetre of storage is 0.02 in, well inside half
 *     a quarter-inch step, so every length entered on the inch stepper comes back exactly;
 *   * a tenth of a centimetre, which is a whole millimetre, so cm never moves at all;
 *   * a tenth of an ounce, beside the pounds (7 lb 4.3 oz), and ten grams in kg (4.53 kg).
 *
 * The one thing this costs: a length entered in cm and read in inches is written to the nearest
 * quarter inch (52.0 cm reads 20.5 in, where the arithmetic says 20.47). That is as fine as an
 * inch reader could have entered it, and it is where their own editor opens it
 * (`mmToLengthStep`). (`plain`, the no-trailing-zeros writer, sits with the volume above.)
 */

/** A length or head measurement, or the difference between two: `22 in`, `22.25 in`, `52.1 cm`. */
export const lengthLabel = (mm: number, unit: LengthUnit): string =>
  `${plain(mmToLengthStep(mm, unit), 2)} ${UNIT_LABEL[unit] ?? unit}`;

/**
 * A length PER 30 DAYS. A rate is arithmetic, not a measurement, so it is not put on a tape's
 * grid: 1.14 in snapped to a quarter inch is 1.25, a tenth of a month's growth that was never
 * there. One place in either unit.
 */
export const lengthRateLabel = (mm: number, unit: LengthUnit): string =>
  `${plain(unit === 'cm' ? mm / 10 : mm / MM_PER_IN, 1)} ${UNIT_LABEL[unit] ?? unit}`;

/** A weight, or a change in one: `7 lb 4.3 oz`, `15.2 oz` under a pound, `4.53 kg`. */
export function weightLabel(g: number, unit: WeightUnit): string {
  if (unit === 'kg') return `${plain(gramsToKg(g), 2)} kg`;
  const { lb, oz } = gramsToLbOz(Math.round(g));
  return lb > 0 ? `${lb} lb ${plain(oz, 1)} oz` : `${plain(oz, 1)} oz`;
}

/* ------------------------------------------------------------ temperature */

/**
 * Stored °C×100 to the display scale, one decimal.
 *
 * Hundredths are stored so a Fahrenheit reading survives the round trip: 98.6 °F is
 * 37.0000 °C and 99.1 °F is 37.2777…, and storing whole tenths of a degree C would quantise
 * the F scale visibly. There is no threshold, no color and no label anywhere near this
 * function — §6.8 is explicit that a temperature is recorded as measured and not interpreted.
 */
export const tempToDisplay = (cHundredths: number, unit: TempUnit): number => {
  const c = cHundredths / 100;
  // one decimal in BOTH scales: the stepper's temp step is 0.1, so rounding Fahrenheit to a
  // whole degree here would make half the taps appear to do nothing
  return unit === 'c' ? Math.round(c * 10) / 10 : Math.round(((c * 9) / 5 + 32) * 10) / 10;
};

/** Display temperature to stored °C×100. */
export const displayToTemp = (value: number, unit: TempUnit): number =>
  Math.round((unit === 'c' ? value : ((value - 32) * 5) / 9) * 100);

/**
 * The suffix a stepper shows beside its value. Milliliters are `mL` — the stored unit is `ml`, the
 * symbol a person reads is `mL` (the owner, 2026-09-26); a label of a thousand and more is written
 * in liters by `volumeText`, never by a stepper, whose number stays in milliliters.
 */
export const UNIT_LABEL: Readonly<Record<string, string>> = {
  oz: 'oz',
  ml: 'mL',
  kg: 'kg',
  lb_oz: 'lb',
  in: 'in',
  cm: 'cm',
  f: '°F',
  c: '°C',
  min: 'min',
};
