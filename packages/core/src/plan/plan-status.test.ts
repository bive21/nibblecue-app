import { describe, expect, it } from 'vitest';
import { tierFor } from './entitlements';
import { planStatusFrom, rowGrantsPlus, type PlanRowInput } from './plan-status';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const future = '2026-09-20T12:00:00Z';
const past = '2026-09-01T12:00:00Z';
const row = (partial: Partial<PlanRowInput> & Pick<PlanRowInput, 'status'>): PlanRowInput => ({
  source: 'store',
  current_period_end: null,
  ...partial,
});

describe('planStatusFrom — the store row becomes the plan status here and nowhere else', () => {
  it('is FREE with no row at all', () => {
    expect(planStatusFrom(null, NOW)).toBe('FREE');
    expect(tierFor(planStatusFrom(null, NOW))).toBe('FREE');
  });

  it('is WELCOME while the preview runs and FREE — never locked, never EXPIRED — after it', () => {
    expect(
      planStatusFrom(row({ status: 'ACTIVE', source: 'welcome', current_period_end: future }), NOW),
    ).toBe('WELCOME');
    expect(
      planStatusFrom(row({ status: 'ACTIVE', source: 'welcome', current_period_end: past }), NOW),
    ).toBe('FREE');
    expect(
      planStatusFrom(row({ status: 'EXPIRED', source: 'welcome', current_period_end: past }), NOW),
    ).toBe('FREE');
  });

  it('is never extended by a clock: the same row is WELCOME at one instant and FREE a second later', () => {
    const r = row({ status: 'ACTIVE', source: 'welcome', current_period_end: future });
    expect(planStatusFrom(r, Date.parse(future) - 1000)).toBe('WELCOME');
    expect(planStatusFrom(r, Date.parse(future))).toBe('FREE');
  });

  it('maps the store states that keep Plus', () => {
    expect(planStatusFrom(row({ status: 'TRIAL', current_period_end: future }), NOW)).toBe('TRIAL');
    expect(planStatusFrom(row({ status: 'ACTIVE', current_period_end: future }), NOW)).toBe(
      'ACTIVE',
    );
    expect(planStatusFrom(row({ status: 'GRACE_PERIOD', current_period_end: future }), NOW)).toBe(
      'GRACE',
    );
    expect(planStatusFrom(row({ status: 'BILLING_ISSUE', current_period_end: future }), NOW)).toBe(
      'GRACE',
    );
    for (const s of ['TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'BILLING_ISSUE'] as const) {
      expect(tierFor(planStatusFrom(row({ status: s, current_period_end: future }), NOW)), s).toBe(
        'PLUS',
      );
    }
  });

  it('keeps a canceled subscription on Plus until the store’s period end, then holds (acceptance test 8)', () => {
    const canceled = row({ status: 'CANCELLED_AT_PERIOD_END', current_period_end: future });
    expect(planStatusFrom(canceled, NOW)).toBe('CANCELLED_AT_PERIOD_END');
    expect(tierFor(planStatusFrom(canceled, NOW))).toBe('PLUS');
    const afterwards = planStatusFrom(canceled, Date.parse(future) + 1);
    expect(afterwards).toBe('ON_HOLD');
    expect(tierFor(afterwards)).toBe('FREE');
  });

  it('holds, rather than expires, a billing issue whose paid period has ended', () => {
    expect(planStatusFrom(row({ status: 'BILLING_ISSUE', current_period_end: past }), NOW)).toBe(
      'ON_HOLD',
    );
  });

  it('ends a granted Plus at its date, to the free plan, and keeps one with no date', () => {
    const grant = (end: string | null) =>
      row({ status: 'ACTIVE', source: 'promo', current_period_end: end });
    expect(planStatusFrom(grant(future), NOW)).toBe('ACTIVE');
    expect(planStatusFrom(grant(null), NOW)).toBe('ACTIVE');
    expect(planStatusFrom(grant(past), NOW)).toBe('FREE');
    // the same row, a second either side of its end: the date decides, not a clock
    expect(planStatusFrom(grant(future), Date.parse(future) - 1000)).toBe('ACTIVE');
    expect(planStatusFrom(grant(future), Date.parse(future))).toBe('FREE');
    // a revoked grant ends as a revoked store row does
    expect(
      planStatusFrom(row({ status: 'REVOKED', source: 'promo', current_period_end: future }), NOW),
    ).toBe('EXPIRED');
  });

  it('says whether a row gives Plus now by the same derivation (app.household_plan ranks by it)', () => {
    const cases: [PlanRowInput, boolean][] = [
      [row({ status: 'ACTIVE', source: 'welcome', current_period_end: future }), true],
      [row({ status: 'ACTIVE', source: 'welcome', current_period_end: past }), false],
      [row({ status: 'ACTIVE', source: 'promo', current_period_end: future }), true],
      [row({ status: 'ACTIVE', source: 'promo', current_period_end: past }), false],
      [row({ status: 'ACTIVE', source: 'promo', current_period_end: null }), true],
      [row({ status: 'TRIAL', current_period_end: future }), true],
      [row({ status: 'ACTIVE', current_period_end: past }), true],
      [row({ status: 'GRACE_PERIOD', current_period_end: past }), true],
      [row({ status: 'BILLING_ISSUE', current_period_end: future }), true],
      [row({ status: 'BILLING_ISSUE', current_period_end: past }), false],
      [row({ status: 'CANCELLED_AT_PERIOD_END', current_period_end: future }), true],
      [row({ status: 'CANCELLED_AT_PERIOD_END', current_period_end: past }), false],
      [row({ status: 'CANCELLED_AT_PERIOD_END', current_period_end: null }), true],
      [row({ status: 'EXPIRED', current_period_end: future }), false],
      [row({ status: 'REVOKED', current_period_end: future }), false],
    ];
    for (const [r, want] of cases) {
      expect(rowGrantsPlus(r, NOW), `${r.source} ${r.status} ${r.current_period_end}`).toBe(want);
    }
  });

  it('ends access on EXPIRED and REVOKED', () => {
    for (const s of ['EXPIRED', 'REVOKED'] as const) {
      const status = planStatusFrom(row({ status: s, current_period_end: past }), NOW);
      expect(status).toBe('EXPIRED');
      expect(tierFor(status)).toBe('FREE');
    }
  });

  it('never reads a product id or a price — the input has neither', () => {
    const keys = Object.keys(row({ status: 'ACTIVE' }));
    expect(keys).toEqual(['source', 'current_period_end', 'status']);
  });
});
