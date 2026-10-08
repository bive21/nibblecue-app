import { describe, expect, it } from 'vitest';
import { backoffBaseMs, backoffDelayMs, isFinalAttempt } from './backoff';
import { BASE_MS, CAP_MS, MAX_ATTEMPTS } from './constants';

describe('backoffDelayMs', () => {
  it('doubles from one second: 1 s, 2 s, 4 s …', () => {
    expect(backoffBaseMs(0)).toBe(1_000);
    expect(backoffBaseMs(1)).toBe(2_000);
    expect(backoffBaseMs(2)).toBe(4_000);
    expect(backoffBaseMs(3)).toBe(8_000);
  });

  it('caps the base at five minutes', () => {
    expect(backoffBaseMs(8)).toBe(256_000);
    expect(backoffBaseMs(9)).toBe(CAP_MS);
    expect(backoffBaseMs(40)).toBe(CAP_MS);
    expect(CAP_MS).toBe(300_000);
  });

  it('jitters within [base/2, base) — half to full, never zero and never over the base', () => {
    for (const attempts of [0, 1, 2, 5, 9]) {
      const base = backoffBaseMs(attempts);
      expect(backoffDelayMs(attempts, () => 0)).toBe(base / 2);
      expect(backoffDelayMs(attempts, () => 0.999999)).toBeLessThan(base);
      expect(backoffDelayMs(attempts, () => 0.999999)).toBeGreaterThan(base * 0.99);
      for (let i = 0; i < 200; i++) {
        const d = backoffDelayMs(attempts);
        expect(d).toBeGreaterThanOrEqual(base / 2);
        expect(d).toBeLessThan(base);
      }
    }
  });

  it('is the outbox schedule, not the auth schedule', () => {
    // apps/mobile/src/auth/session.ts is 1.0x-1.5x of the same bases and is deliberately
    // untouched: re-pointing it here would change shipped token-refresh behavior.
    expect(backoffDelayMs(0, () => 0)).toBe(BASE_MS / 2);
    expect(backoffDelayMs(0, () => 0.999999)).toBeLessThan(BASE_MS);
  });

  it('refuses a negative or fractional attempt count', () => {
    expect(() => backoffDelayMs(-1)).toThrow(RangeError);
    expect(() => backoffDelayMs(1.5)).toThrow(RangeError);
  });
});

describe('the MAX_ATTEMPTS boundary', () => {
  it('parks the op only on the tenth rejection', () => {
    expect(MAX_ATTEMPTS).toBe(10);
    expect(isFinalAttempt(0)).toBe(false);
    expect(isFinalAttempt(8)).toBe(false);
    expect(isFinalAttempt(9)).toBe(true);
    expect(isFinalAttempt(10)).toBe(true);
  });
});
