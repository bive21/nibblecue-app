/**
 * THE GROWTH SHEET'S NUMBERS, as data (PRODUCT_SPEC.md §6.9; `packages/core/entry/units.ts`).
 *
 * Kept out of the component so every rule is a node test. Three came from the audit of
 * 2026-09-24:
 *
 *   * A STEPPER HOLDS ITS DISPLAY VALUE, ON ITS OWN GRID (units.ts's own rule, which this sheet
 *     broke). It held millimetres and grams and converted on every tap, starting from 500 mm —
 *     19.69 in — so a quarter-inch step read 19.94, 20.19, 20.44… and 20, 22 or 24 in could never
 *     be entered as measured (H1). A value is now a number in the unit it is shown in, moved onto
 *     that unit's grid once when it is filled in, and converted to canonical ONCE, on save.
 *   * NOTHING IS SAVED THAT THE PARENT DID NOT SWITCH ON (C1). Weight and length used to start
 *     switched on at a newborn's 3.5 kg and 50 cm, so a weigh-in at home also saved a length of
 *     50 cm — shown as the latest length, with a negative change, everywhere growth is read.
 *   * A WEIGHT IS MORE THAN NOTHING. 0 lb 0 oz could be stepped to, and the server's
 *     `weight_g > 0` refused it.
 *
 * The starting values when a child has no measurement yet are a newborn's page in a notebook —
 * the position of a control, never a norm. Once a child has one, each metric opens on its own
 * last value (lastMeasurement.ts): a pre-selection, never a claim (core `remembered.ts`).
 */
import {
  gramsToKgStep,
  gramsToLbOz,
  kgToGrams,
  lbOzToGrams,
  lengthToMm,
  mmToLengthStep,
  type LengthUnit,
  type WeightUnit,
} from '@nibblecue/core';

export const START_WEIGHT_G = 3500;
export const START_LENGTH_MM = 500;
export const START_HEAD_MM = 350;

/** A weight as its stepper holds it: kilograms on the ten-gram grid, or pounds and ounces. */
export type WeightValue = { unit: 'kg'; kg: number } | { unit: 'lb_oz'; lb: number; oz: number };

/** A length (or a head circumference) as its stepper holds it. */
export interface LengthValue {
  unit: LengthUnit;
  value: number;
}

export function weightValue(g: number, unit: WeightUnit): WeightValue {
  if (unit === 'kg') return { unit: 'kg', kg: gramsToKgStep(g) };
  const { lb, oz } = gramsToLbOz(g);
  return { unit: 'lb_oz', lb, oz };
}

export const weightGrams = (v: WeightValue): number =>
  v.unit === 'kg' ? kgToGrams(v.kg) : lbOzToGrams({ lb: v.lb, oz: v.oz });

export const lengthValue = (mm: number, unit: LengthUnit): LengthValue => ({
  unit,
  value: mmToLengthStep(mm, unit),
});

export const lengthMillimetres = (v: LengthValue): number => lengthToMm(v.value, v.unit);

/**
 * A value read in the viewer's unit. The profile's units arrive after the first render, so a
 * value filled in before them is carried across — through canonical once — rather than shown in
 * a unit the parent does not read.
 */
export const weightIn = (v: WeightValue, unit: WeightUnit): WeightValue =>
  v.unit === unit ? v : weightValue(weightGrams(v), unit);

export const lengthIn = (v: LengthValue, unit: LengthUnit): LengthValue =>
  v.unit === unit ? v : lengthValue(lengthMillimetres(v), unit);

/* ------------------------------------------------------------ pounds and ounces, one row */

/**
 * OUNCES CARRY INTO POUNDS (the owner, 2026-09-26: *"weight: lb and oz does not need 2 rows 1 for
 * each, they can be smaller and sit next to each other and it would make sense too since you only
 * need to enter one for the other to adjust"*). The two numbers sit side by side now, and the
 * ounces' + at 15.9 goes on to the next pound — 7 lb 15.9 oz, one tap, 8 lb 0 oz — so a parent can
 * walk a whole weight with the ounces alone, or type 16 into them for the next pound. The pounds'
 * own − and + still move a pound.
 *
 * Only UP: the ounces' − stops at 0, where the pound's − is beside it. A borrow would need the
 * ounces to step to −0.1 first, and a number that can go below zero is drawn a sign's width wider
 * on a row that has none to spare (`compactValueWidth`).
 */
const OZ_PER_LB = 16;

/** The ounces stepper's range: one step past 15.9 while there is a next pound to carry into. */
export function ozRange(lb: number, maxLb: number, step: number): { min: number; max: number } {
  return { min: 0, max: lb < maxLb ? OZ_PER_LB : OZ_PER_LB - step };
}

/**
 * A weight as the two steppers set it, carried: any ounces of a pound or more go into the pounds,
 * held on the tenth-of-an-ounce grid and inside [0, `maxLb` lb 15.9 oz].
 */
export function carryLbOz(
  lb: number,
  oz: number,
  maxLb: number,
  step: number,
): { lb: number; oz: number } {
  const places = 10;
  const total = Math.max(0, lb * OZ_PER_LB + oz);
  const top = maxLb * OZ_PER_LB + (OZ_PER_LB - step);
  const clamped = Math.round(Math.min(top, total) * places) / places;
  const pounds = Math.floor(clamped / OZ_PER_LB + 1e-9);
  const ounces = Math.round((clamped - pounds * OZ_PER_LB) * places) / places;
  return { lb: pounds, oz: ounces };
}

/* ------------------------------------------------------------ in or cm, on the sheet */

/**
 * LENGTH AND HEAD IN INCHES OR CENTIMETERS, CHOSEN ON THE SHEET (the owner, 2026-09-26: *"we need
 * to show cm option for length and head too"*). A clinic's tape is in centimeters and a home one
 * often in inches, and the profile's unit could not be changed anywhere in the app, so a parent
 * reading a clinic's 52.3 cm had to convert it by hand. The switch shows the numbers in the other
 * unit — each converted through canonical once (`lengthIn`), onto that unit's grid — and nothing
 * saved changes: a length is stored in millimeters whichever unit it was entered in.
 */
export const LENGTH_UNIT_OPTIONS: readonly {
  value: LengthUnit;
  label: string;
  accessibilityLabel: string;
}[] = [
  { value: 'in', label: 'in', accessibilityLabel: 'Inches' },
  { value: 'cm', label: 'cm', accessibilityLabel: 'Centimeters' },
];

/**
 * WEIGHT IN POUNDS AND OUNCES OR KILOGRAMS, CHOSEN ON THE SHEET (2026-10-03): same shape as the
 * tape's in / cm switch. A clinic scale reads kilograms and a home one often pounds and ounces;
 * the profile's unit could not be changed in the app, so a parent reading 4.53 kg had to convert
 * by hand. The switch shows the number in the other unit — through canonical once (`weightIn`) —
 * and nothing saved changes: a weight is stored in grams whichever unit it was entered in.
 */
export const WEIGHT_UNIT_OPTIONS: readonly {
  value: WeightUnit;
  label: string;
  accessibilityLabel: string;
}[] = [
  { value: 'lb_oz', label: 'lb', accessibilityLabel: 'Pounds and ounces' },
  { value: 'kg', label: 'kg', accessibilityLabel: 'Kilograms' },
];

export type Metric = 'weight' | 'length' | 'head';

export interface GrowthDraft {
  weight: WeightValue;
  length: LengthValue;
  head: LengthValue;
  /** Which metrics the parent switched on — the only ones that are saved. */
  on: Readonly<Record<Metric, boolean>>;
}

export type GrowthProblem = 'nothing' | 'weightZero';

export interface GrowthSave {
  weightG: number | null;
  lengthMm: number | null;
  headMm: number | null;
}

/** What a Save writes: the metrics that are on, converted once — or why it cannot. */
export function growthSave(d: GrowthDraft): GrowthSave | GrowthProblem {
  if (!d.on.weight && !d.on.length && !d.on.head) return 'nothing';
  const weightG = d.on.weight ? weightGrams(d.weight) : null;
  if (weightG !== null && weightG <= 0) return 'weightZero';
  return {
    weightG,
    lengthMm: d.on.length ? lengthMillimetres(d.length) : null,
    headMm: d.on.head ? lengthMillimetres(d.head) : null,
  };
}

export const isGrowthProblem = (r: GrowthSave | GrowthProblem): r is GrowthProblem =>
  typeof r === 'string';
