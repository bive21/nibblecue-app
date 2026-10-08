/**
 * The injected clock. **Test-only** (see ./local-db.ts and `no-bundle.test.ts`).
 *
 * Every clock-dependent path in the sync layer — the retry schedule, the dedupe window, the
 * stuck-`SENDING` reclaim, the commit-lag overlap, the edit clock — takes a `now()` rather
 * than calling `Date.now()`, so a test states the passage of time instead of sleeping through
 * it. A suite that sleeps is a suite that is flaky on a loaded CI runner.
 */
export interface Clock {
  now(): number;
  iso(at?: number): string;
}

export class FakeClock implements Clock {
  private t: number;

  constructor(start: number | string = '2026-09-14T08:00:00.000Z') {
    this.t = typeof start === 'number' ? start : Date.parse(start);
  }

  now(): number {
    return this.t;
  }

  iso(at?: number): string {
    return new Date(at ?? this.t).toISOString();
  }

  /** Move time forward. Never backward: a clock that goes back hides an ordering bug. */
  advance(ms: number): number {
    if (ms < 0) throw new Error('FakeClock.advance: time only moves forward');
    this.t += ms;
    return this.t;
  }
}
