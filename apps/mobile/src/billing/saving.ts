/**
 * WHAT THE ANNUAL PLAN SAVES, against twelve months of the monthly one (the owner, 2026-09-26:
 * *"don't just show the price 59.00, think what we can do better to entice user to click. perhaps
 * do the 6.99x12 price = $83.88 (scribbled) $59.00, then save x% off"*).
 *
 * The annual plan is drawn as ~~twelve months at the monthly price~~, then its own price, then
 * "Save N%". Every part of that comes from the store at runtime (CLAUDE.md rule 13):
 *
 *   · the struck-through figure is the store SDK's own string for twelve months of the MONTHLY
 *     product (`perYearLabel`, RevenueCat's `pricePerYearString`), in the store's currency and
 *     format — the app formats no amount;
 *   · the annual price is the store's `priceLabel`, as it always was;
 *   · the percentage is the one sum the app does, over the two numbers the SDK gave (`amount`).
 *
 * WHY THIS IS HONEST, and inside both stores' rules. The comparison is the app's real monthly
 * price, the one the same page sells beside it — not an invented "was" price, and not a list price
 * nobody ever paid. The percentage is rounded DOWN: 29.7% is "Save 29%", never 30, so the claim is
 * never bigger than the arithmetic.
 *
 * WHEN IT SAYS NOTHING, which is the whole of the function's caution. No monthly plan or no annual
 * one on the shelf; no amount for either; the two priced in different currencies (or one unknown);
 * no store string for the struck figure; or a saving that is not a real one — zero, negative, or
 * less than one whole percent. In every one of those the annual plan is shown as it was before:
 * its price, and nothing struck through.
 *
 * WHOLE NUMBERS, NOT FLOATS. The amounts are turned into millionths before any sum, so 12 × 6.99
 * is 83 880 000 rather than 83.88000000000001, and a saving of exactly 20% floors to 20 rather
 * than to 19 through a rounding error. A division of two whole numbers whose true answer is whole
 * comes out exact, so the floor is only ever taken off a real fraction.
 */
import type { StoreProduct } from './types';

export interface AnnualSaving {
  /** The monthly plan's id — whose price, times twelve, the annual plan is shown against. */
  monthlyId: string;
  /** The annual plan's id: the product the saving is drawn on. */
  annualId: string;
  /** Twelve months at the monthly price, as the store formatted it. Drawn struck through. */
  wasLabel: string;
  /** Whole percent saved, rounded down, at least 1. */
  percent: number;
}

/** A price as whole millionths of its currency, or null when it is not a real, positive price. */
function micros(amount: number | null): number | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 1_000_000);
}

export function annualSaving(products: readonly StoreProduct[]): AnnualSaving | null {
  const monthly = products.find(p => p.period === 'MONTH');
  const annual = products.find(p => p.period === 'YEAR');
  if (monthly === undefined || annual === undefined) return null;

  // the struck figure has to be the store's own string, or there is nothing honest to strike
  const wasLabel = monthly.perYearLabel;
  if (wasLabel === null || wasLabel.trim() === '') return null;

  // one currency, known on both sides: a saving across two currencies is not a saving
  if (monthly.currency === null || annual.currency === null) return null;
  if (monthly.currency.toUpperCase() !== annual.currency.toUpperCase()) return null;

  const month = micros(monthly.amount);
  const year = micros(annual.amount);
  if (month === null || year === null) return null;

  const twelve = month * 12;
  const saved = twelve - year;
  if (saved <= 0) return null;
  const percent = Math.floor((saved * 100) / twelve);
  // "Save 0%" is not a saving worth a line
  if (percent < 1) return null;

  return { monthlyId: monthly.id, annualId: annual.id, wasLabel, percent };
}
