import { describe, expect, it } from 'vitest';
import { careCellLabel, NOT_LOGGED_YET } from './care';

const NY = 'America/New_York';
// 2026-09-15 20:00 New York
const NOW = Date.UTC(2026, 8, 16, 0, 0, 0);

describe('careCellLabel — bath in days, the rest in elapsed time (Addendum C.2, D6)', () => {
  it('reads today, yesterday, then N days ago for a bath', () => {
    expect(careCellLabel({ lastAtMs: NOW - 2 * 3_600_000, style: 'days' }, NOW, NY)).toBe('today');
    expect(careCellLabel({ lastAtMs: NOW - 26 * 3_600_000, style: 'days' }, NOW, NY)).toBe(
      'yesterday',
    );
    expect(careCellLabel({ lastAtMs: NOW - 4 * 24 * 3_600_000, style: 'days' }, NOW, NY)).toBe(
      '4 days ago',
    );
  });

  it('counts by LOCAL day: a bath at 11 pm last night is yesterday even 1 hour later', () => {
    // 2026-09-15 00:30 New York = 04:30Z; the bath at 23:00 the night before = 03:00Z
    const now = Date.UTC(2026, 8, 15, 4, 30);
    const bath = Date.UTC(2026, 8, 15, 3, 0);
    expect(careCellLabel({ lastAtMs: bath, style: 'days' }, now, NY)).toBe('yesterday');
  });

  it('reads elapsed time for the others', () => {
    expect(
      careCellLabel({ lastAtMs: NOW - (10 * 60 + 28) * 60_000, style: 'elapsed' }, NOW, NY),
    ).toBe('10h 28m ago');
  });

  it('says not logged yet when there is nothing, in either style', () => {
    expect(careCellLabel({ lastAtMs: null, style: 'days' }, NOW, NY)).toBe(NOT_LOGGED_YET);
    expect(careCellLabel({ lastAtMs: null, style: 'elapsed' }, NOW, NY)).toBe(NOT_LOGGED_YET);
  });
});
