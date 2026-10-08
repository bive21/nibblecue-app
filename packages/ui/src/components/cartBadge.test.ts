/**
 * THE CART'S COUNT BADGE (`cartBadge.ts`, `CartBadge.tsx`; the owner, 2026-09-26: *"the cart has no
 * count badge ... add this feature"*). The rules are numbers a node test reads; the component is held
 * to them by its source, the way this package tests what it cannot render.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CART_BADGE,
  CART_BADGE_ARRIVE_KEYS,
  CART_BADGE_BUMP_KEYS,
  CART_BADGE_MS,
  CART_BADGE_OUT,
  cartBadgeFrames,
  cartBadgeMove,
  cartBadgeShown,
  cartBadgeText,
} from './cartBadge';
import { CART_BOUNCE_MS } from './cartFlight';
import { sampleFrame } from './keyframes';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

describe('what the badge says', () => {
  it('is the count still to buy, and nothing at all when there is none', () => {
    expect(cartBadgeShown(0)).toBe(false);
    expect(cartBadgeShown(-1)).toBe(false);
    expect(cartBadgeShown(Number.NaN)).toBe(false);
    expect(cartBadgeShown(1)).toBe(true);
    expect(cartBadgeText(1)).toBe('1');
    expect(cartBadgeText(12)).toBe('12');
    expect(cartBadgeText(99)).toBe('99');
    // a glance, not the record: the card's words say the real number
    expect(cartBadgeText(100)).toBe('99+');
  });

  it('sits on the cart’s corner, a disc no wider than the card’s padding can hold', () => {
    expect(CART_BADGE).toBeGreaterThanOrEqual(16);
    // its box reaches past the square's corner by less than the card's own padding (space.lg, 16)
    expect(CART_BADGE_OUT).toBeLessThan(16);
    expect(CART_BADGE_OUT).toBeLessThan(CART_BADGE / 2);
  });
});

describe('when it moves', () => {
  const at = (count: number, bump: number) => ({ count, bump });

  it('bumps on a landing that raises the count, and pops in to an empty cart', () => {
    expect(cartBadgeMove(at(2, 4), at(3, 5), false)).toBe('bump');
    expect(cartBadgeMove(at(0, 4), at(1, 5), false)).toBe('arrive');
  });

  it('never moves for a change with no landing: the list read in, a line taken off, the other phone', () => {
    expect(cartBadgeMove(at(0, 0), at(5, 0), false)).toBeNull();
    expect(cartBadgeMove(at(3, 2), at(2, 2), false)).toBeNull();
    expect(cartBadgeMove(at(3, 2), at(4, 2), false)).toBeNull();
    // a landing that did not raise it (the thing was already on the list) moves nothing either
    expect(cartBadgeMove(at(3, 2), at(3, 3), false)).toBeNull();
    expect(cartBadgeMove(at(1, 2), at(0, 3), false)).toBeNull();
  });

  it('never moves under reduce motion or in the amber Night', () => {
    expect(cartBadgeMove(at(2, 4), at(3, 5), true)).toBeNull();
    expect(cartBadgeMove(at(0, 4), at(1, 5), true)).toBeNull();
  });

  it('bumps up and settles at full size, inside the cart’s own bounce', () => {
    const bump = cartBadgeFrames('bump').scale;
    expect(sampleFrame(bump, 0)).toBe(1);
    expect(sampleFrame(bump, 1)).toBe(1);
    expect(Math.max(...bump.outputRange)).toBeCloseTo(1.3, 5);
    expect(Math.min(...bump.outputRange)).toBeCloseTo(0.92, 5);
    const arrive = cartBadgeFrames('arrive').scale;
    expect(sampleFrame(arrive, 0)).toBe(0);
    expect(sampleFrame(arrive, 1)).toBe(1);
    expect(Math.max(...arrive.outputRange)).toBeCloseTo(1.2, 5);
    // done before the cart stops rocking: the two land as one thing
    expect(CART_BADGE_MS).toBeLessThanOrEqual(CART_BOUNCE_MS);
    for (const keys of [CART_BADGE_BUMP_KEYS, CART_BADGE_ARRIVE_KEYS])
      expect(keys[keys.length - 1]).toEqual([1, 1]);
  });
});

describe('the component', () => {
  const src = read('CartBadge.tsx');

  it('is hidden from assistive technology and takes no touch', () => {
    expect(src).toContain('accessibilityElementsHidden');
    expect(src).toContain('importantForAccessibility="no-hide-descendants"');
    expect(src).toContain('pointerEvents="none"');
  });

  it('draws nothing at zero and rolls its digit on the cart’s own landing', () => {
    expect(src).toContain('if (!cartBadgeShown(count)) return null;');
    expect(src).toMatch(/<CountRoll[\s\S]*?value=\{count\}[\s\S]*?bump=\{bump\}/);
    expect(src).toContain('{cartBadgeText(count)}');
  });

  it('stands still under reduce motion and in Night, on the native driver otherwise', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(src).toContain('useNativeDriver: true');
    expect(src).toContain('if (still) v.setValue(1);');
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      const source = m[1] ?? '';
      expect(['react', 'react-native'].includes(source) || /^\./.test(source), source).toBe(true);
    }
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(read('core.ts')).toContain("export * from './CartBadge';");
  });
});
