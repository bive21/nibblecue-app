import { describe, expect, it } from 'vitest';
import { cadenceOccurrences } from './cadence';
import { at, ctx, rule, sess } from './fixtures';

const bathEvery2 = rule({
  id: 'b',
  activity: 'bath',
  ruleType: 'CADENCE',
  everyDays: 2,
  atLocalTime: '18:30',
});
const bathTueSat = rule({
  id: 't',
  activity: 'bath',
  ruleType: 'CADENCE',
  repeatDays: [2, 6],
  atLocalTime: '18:30',
});
const bathDaily = rule({
  id: 'd',
  activity: 'bath',
  ruleType: 'CADENCE',
  everyDays: 1,
  atLocalTime: '18:30',
});
const monday = { y: 2026, m: 6, d: 8 } as const;
const tuesday = { y: 2026, m: 6, d: 9 } as const;

describe('cadence rules (SCHEDULE_LOGIC §5b worked examples)', () => {
  it('every 2 days, last bath two days ago → due today 18:30; yesterday → due tomorrow', () => {
    // §5b: the due day is last logged day + every_days. The worked table's first row says
    // "yesterday → today"; the formula and the prototype say tomorrow, and the formula rules.
    const occ = cadenceOccurrences(
      bathEvery2,
      [sess('bath', '19:00', null, { dayOffset: -2 })],
      ctx('10:00'),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ atMs: at('18:30'), status: 'UPCOMING', future: false });
    expect(
      cadenceOccurrences(
        bathEvery2,
        [sess('bath', '19:00', null, { dayOffset: -2 })],
        ctx('19:00'),
      )[0]?.status,
    ).toBe('DUE');
    const tomorrow = cadenceOccurrences(
      bathEvery2,
      [sess('bath', '19:00', null, { dayOffset: -1 })],
      ctx('10:00'),
    );
    expect(tomorrow[0]).toMatchObject({ atMs: at('18:30', 1), status: 'UPCOMING', future: true });
  });

  it('every 2 days, last bath 5 days ago → exactly one DUE slot today, no MISSED chain', () => {
    const occ = cadenceOccurrences(
      bathEvery2,
      [sess('bath', '19:00', null, { dayOffset: -5 })],
      ctx('19:00'),
    );
    expect(occ.map(o => o.status)).toEqual(['DUE']);
    expect(occ[0]?.atMs).toBe(at('18:30'));
  });

  it('every 2 days, bath logged 07:00 today → DONE (day-level match), next in 2 days', () => {
    const occ = cadenceOccurrences(bathEvery2, [sess('bath', '07:10')], ctx('10:00'));
    expect(occ.map(o => [o.status, o.future])).toEqual([
      ['DONE', false],
      ['UPCOMING', true],
    ]);
    expect(occ[1]?.atMs).toBe(at('18:30', 2));
  });

  it('Tue + Sat, last bath Saturday, today Monday → due Tuesday', () => {
    const occ = cadenceOccurrences(
      bathTueSat,
      [sess('bath', '19:00', null, { dayOffset: -2 })],
      ctx('10:00', {}, monday),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({
      status: 'UPCOMING',
      future: true,
      atMs: at('18:30', 1, monday),
    });
  });

  it('Tue + Sat, today is Tuesday and done → today DONE plus an UPCOMING for Saturday', () => {
    const done = cadenceOccurrences(
      bathTueSat,
      [sess('bath', '08:00', null, { day: tuesday })],
      ctx('10:00', {}, tuesday),
    );
    expect(done.map(o => o.status)).toEqual(['DONE', 'UPCOMING']);
    expect(done[1]?.atMs).toBe(at('18:30', 4, tuesday)); // Saturday
  });

  it('every day, done today → DONE, next tomorrow', () => {
    const occ = cadenceOccurrences(bathDaily, [sess('bath', '09:00')], ctx('10:00'));
    expect(occ.map(o => o.status)).toEqual(['DONE', 'UPCOMING']);
    expect(occ[1]?.atMs).toBe(at('18:30', 1));
  });

  it('with nothing ever logged the first bath is due today', () => {
    const occ = cadenceOccurrences(bathEvery2, [], ctx('10:00'));
    expect(occ.map(o => o.status)).toEqual(['UPCOMING']);
    expect(occ[0]?.future).toBe(false);
  });
});
