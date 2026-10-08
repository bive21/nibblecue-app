/**
 * THE CART'S COUNT BADGE, as numbers (the owner, 2026-09-26: *"the cart has no count badge ... add
 * this feature"*). The Supplies page's cart — the one a row's + throws into — carries the number of
 * lines still to buy on its top-right corner, the way a shop's cart does. Pure TypeScript, tested in
 * node like `cartFlight.ts`; `CartBadge.tsx` only hands these numbers to `interpolate`.
 *
 * WHAT IT SHOWS: the count the card beside it says, held with it until each thrown thing lands
 * (the page's `cartShows`), so the badge and the words never disagree for a frame. Nothing to buy,
 * no badge — an empty cart has no number on it. A glance, not the record: past 99 it says `99+`,
 * and the card's own words and spoken name carry the real number.
 *
 * WHAT MOVES, and only on a landing (a new `bump` with a higher count): the badge BUMPS — 1 → 1.3 →
 * 0.92 → 1 in 300 ms, about its own middle — as the cart bounces and its digit rolls to the new
 * number (`CountRoll`); the first thing into an empty cart POPS the badge in from nothing instead.
 * A count that changes with no landing — the list read in as the page opens, a line taken off, the
 * other phone's change — is simply set, exactly as the card's words are. Reduce motion and the amber
 * Night: never moves. No haptic of its own: the landing is felt once, by the throw (`cartLanding`).
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, type Key } from './keyframes';

/** The disc: its height, and its narrowest width — a circle round one digit. */
export const CART_BADGE = 18;
/** The keyline round it, in the ground's color. */
export const CART_BADGE_RING = 2;
/**
 * How far past the cart square's top-right corner the badge's box reaches, each way: its middle a
 * few points inside the corner, so it reads as ON the cart and never leaves the card it is on
 * (the card's padding, `space.lg`, is well over this).
 */
export const CART_BADGE_OUT = 6;

/** The badge's words: the count, or `99+` past two digits — the card says the real number. */
export const cartBadgeText = (n: number): string => (n > 99 ? '99+' : String(n));

/** Drawn at all: only while something is still to buy. */
export const cartBadgeShown = (n: number): boolean => Number.isFinite(n) && n > 0;

/** The bump, and the pop into an empty cart: one clock, the cart's bounce's own length or less. */
export const CART_BADGE_MS = 300;

/** 1 → 1.3 → 0.92 → 1: up as the thing lands, a little back through rest, settled. */
export const CART_BADGE_BUMP_KEYS: readonly Key[] = [
  [0, 1],
  [0.3, 1.3],
  [0.65, 0.92],
  [1, 1],
];

/** The first thing into an empty cart: from nothing to a hair past full, and settled. */
export const CART_BADGE_ARRIVE_KEYS: readonly Key[] = [
  [0, 0],
  [0.55, 1.2],
  [0.8, 0.95],
  [1, 1],
];

export type CartBadgeMove = 'bump' | 'arrive';

export interface CartBadgeState {
  count: number;
  bump: number;
}

/**
 * How a change moves the badge, or null for none. Only a LANDING moves it — a new `bump` that
 * raised the count; anything else, and anything under reduce motion or in Night, is simply set.
 */
export function cartBadgeMove(
  before: CartBadgeState,
  now: CartBadgeState,
  still: boolean,
): CartBadgeMove | null {
  if (still || now.bump === before.bump) return null;
  if (!cartBadgeShown(now.count) || !(now.count > before.count)) return null;
  return cartBadgeShown(before.count) ? 'bump' : 'arrive';
}

/** The badge's scale over the move's clock, 0 → 1. */
export function cartBadgeFrames(move: CartBadgeMove): { scale: Frame } {
  return { scale: keyFrame(move === 'arrive' ? CART_BADGE_ARRIVE_KEYS : CART_BADGE_BUMP_KEYS) };
}
