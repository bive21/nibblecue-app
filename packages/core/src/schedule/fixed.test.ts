import { describe, expect, it } from 'vitest';
import { wallClock, zonedToUtc } from '../today/day';
import { at, ctx, rule, sess, TZ } from './fixtures';
import { fixedOccurrence, resolveAnchors } from './fixed';
import type { Rule } from './types';
import { atWallTime, dayStartOf } from './time';

const bottle13 = rule({ id: 'r3', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '13:00' });

describe('fixed slots (SCHEDULE_LOGIC §5)', () => {
  it('13:00 bottle: 12:49 is DONE, 13:40 is LATE, 14:30 leaves it MISSED and is an extra', () => {
    expect(fixedOccurrence(bottle13, [sess('bottle', '12:49')], ctx('15:00'))?.status).toBe('DONE');
    const late = fixedOccurrence(bottle13, [sess('bottle', '13:40')], ctx('15:00'));
    expect(late?.status).toBe('LATE');
    expect(late?.minutesLate).toBe(40);
    const missed = fixedOccurrence(bottle13, [sess('bottle', '14:30')], ctx('15:00'));
    expect(missed?.status).toBe('MISSED');
    expect(missed?.matchedId).toBeNull();
  });

  it('ages UPCOMING → DUE → MISSED with nothing logged; a MISSED fixed slot is still at 13:00', () => {
    expect(fixedOccurrence(bottle13, [], ctx('12:00'))?.status).toBe('UPCOMING');
    expect(fixedOccurrence(bottle13, [], ctx('13:30'))?.status).toBe('DUE');
    // …and it stays DUE while a log would still close it: MISSED begins where the late window
    // does, not an hour in (`missAtOf`, the audit's B1)
    expect(fixedOccurrence(bottle13, [], ctx('14:01'))?.status).toBe('DUE');
    const missed = fixedOccurrence(bottle13, [], ctx('14:31'));
    expect(missed?.status).toBe('MISSED');
    expect(missed?.atMs).toBe(at('13:00'));
  });

  it('is not on the days its repeat excludes, and never before the rule existed', () => {
    const weekdays = rule({ ...bottle13, id: 'w', repeat: 'WEEKDAYS' });
    const saturday = { y: 2026, m: 6, d: 13 } as const;
    expect(fixedOccurrence(weekdays, [], ctx('12:00', {}, saturday))).toBeNull();
    const custom = rule({ ...bottle13, id: 'c', repeat: 'CUSTOM', repeatDays: [2, 6] });
    expect(fixedOccurrence(custom, [], ctx('12:00', {}, saturday))).not.toBeNull();
    expect(fixedOccurrence(custom, [], ctx('12:00'))).toBeNull(); // a Wednesday
    const created4pm = rule({ ...bottle13, id: 'e', effectiveFromMs: at('16:00') });
    expect(fixedOccurrence(created4pm, [], ctx('17:00'))).toBeNull();
  });

  it('a nearer session wins the slot; a second one in the window is not a re-match', () => {
    const o = fixedOccurrence(
      bottle13,
      [
        sess('bottle', '12:50', null, { id: 'first' }),
        sess('bottle', '13:05', null, { id: 'second' }),
      ],
      ctx('14:00'),
    );
    expect(o?.status).toBe('DONE');
    // on its own a rule takes the nearest; across rules scheduleDay assigns in time order (today.test)
    expect(o?.matchedId).toBe('second');
  });
});

describe('DST (NOTIFICATIONS §3.1, SCHEDULE_LOGIC §8, §11)', () => {
  it('a fixed 07:00 is still 07:00 on the spring-forward day, one slot, one hour earlier in UTC', () => {
    const r = rule({ id: 'f', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '07:00' });
    const before = fixedOccurrence(r, [], ctx('06:00', {}, { y: 2026, m: 3, d: 7 }));
    const onDay = fixedOccurrence(r, [], ctx('06:00', {}, { y: 2026, m: 3, d: 8 }));
    expect(wallClock(TZ, onDay!.atMs)).toMatchObject({ hour: 7, minute: 0 });
    expect(onDay!.atMs - before!.atMs).toBe(23 * 3_600_000);
  });

  it('a time inside the spring-forward gap shifts forward to the instant the clock jumps to', () => {
    const day = dayStartOf(TZ, zonedToUtc(TZ, 2026, 3, 8, 12));
    const t = atWallTime(TZ, day, '02:30');
    expect(wallClock(TZ, t)).toMatchObject({ hour: 3, minute: 0 });
    expect(t).toBe(Date.UTC(2026, 2, 8, 7, 0));
  });

  it('a time that happens twice on the fall-back day fires on the first occurrence only', () => {
    const day = dayStartOf(TZ, zonedToUtc(TZ, 2026, 11, 1, 12));
    const t = atWallTime(TZ, day, '01:30');
    expect(t).toBe(Date.UTC(2026, 10, 1, 5, 30)); // 01:30 EDT, not 01:30 EST an hour later
    const r = rule({ id: 'f', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '01:30' });
    expect(fixedOccurrence(r, [], ctx('03:00', {}, { y: 2026, m: 11, d: 1 }))?.atMs).toBe(t);
  });
});

describe('relative slots (NOTIFICATIONS §2)', () => {
  const nap = rule({
    id: 'n',
    activity: 'sleep',
    ruleType: 'RELATIVE',
    relativeTo: 'WAKE',
    offsetMinutes: 120,
  });

  it('WAKE is the end of the night sleep that crossed midnight', () => {
    const night = sess('sleep', '19:30', '06:40', { dayOffset: -1, sleepKind: 'NIGHT' });
    night.endMs = at('06:40');
    const o = fixedOccurrence(nap, [night], ctx('08:00'));
    expect(o?.atMs).toBe(at('08:40'));
    expect(o?.provisional).toBe(false);
  });

  it('with no wake yet the slot is provisional, from the household default 07:00', () => {
    const o = fixedOccurrence(nap, [], ctx('06:00'));
    expect(o?.atMs).toBe(at('09:00'));
    expect(o?.provisional).toBe(true);
  });

  it('resolves LAST_FEED and BEDTIME from the log', () => {
    const a = resolveAnchors(
      [
        sess('bottle', '08:10'),
        sess('breastfeed', '10:05'),
        sess('sleep', '19:35', null, { sleepKind: 'NIGHT', running: true }),
      ],
      ctx('20:00'),
      null,
    );
    expect(a.lastFeedMs).toBe(at('10:05'));
    expect(a.bedtimeMs).toBeNull(); // still running: not a completed session, but its start is the bedtime once it ends
  });
});

describe('acceptance test 5 @AT-05 — a logged activity satisfies a schedule (node half)', () => {
  it('5.1 a bottle at 12:50 (or 12:49) marks the 13:00 slot DONE with that bottle', () => {
    for (const t of ['12:50', '12:49']) {
      const o = fixedOccurrence(bottle13, [sess('bottle', t, null, { id: 'b' })], ctx('13:30'));
      expect(o?.status).toBe('DONE');
      expect(o?.matchedId).toBe('b');
    }
  });

  it('5.2 a bottle 26 minutes early is no match; the slot ages to MISSED and the bottle stands alone', () => {
    const o = fixedOccurrence(bottle13, [sess('bottle', '12:34')], ctx('14:31'));
    expect(o?.status).toBe('MISSED');
    expect(o?.matchedId).toBeNull();
  });

  it('5.8 the wrong activity or the wrong child never matches', () => {
    const emma = rule({ ...bottle13, id: 'e', childId: 'emma' });
    expect(
      fixedOccurrence(emma, [sess('sleep', '13:00', null, { childId: 'emma' })], ctx('14:31'))
        ?.status,
    ).toBe('MISSED');
    expect(
      fixedOccurrence(emma, [sess('bottle', '13:00', null, { childId: 'liam' })], ctx('14:31'))
        ?.status,
    ).toBe('MISSED');
    expect(
      fixedOccurrence(emma, [sess('bottle', '13:00', null, { childId: 'emma' })], ctx('14:30'))
        ?.status,
    ).toBe('DONE');
  });

  /**
   * THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is the point. Until 2026-09-18 a
   * breastfeed left a fixed bottle slot MISSED, on the reasoning recorded in `sessions.ts` that
   * a fixed rule "names the thing". The owner overturned it from the phone — "breastfeeding the
   * baby mean, feeding, just like bottle" — because a slot that ages to MISSED after the parent
   * has just fed the baby is telling them they forgot something they did.
   */
  it('5.9 a breastfeed closes a fixed bottle slot, because the baby was fed', () => {
    const emma = rule({ ...bottle13, id: 'e2', childId: 'emma' });
    const o = fixedOccurrence(
      emma,
      [sess('breastfeed', '13:00', null, { childId: 'emma' })],
      ctx('14:30'),
    );
    expect(o?.status).toBe('DONE');
    expect(o?.matchedId).not.toBeNull();
  });
});

/**
 * A CARE ITEM IS A DAY QUESTION (§5b). The vitamin whose recommended time is 8 a.m., given at
 * 8 p.m., was done — late, not missed — and the slot has to say so, because the alternative is
 * an app that contradicts the parent's own entry (the owner, 2026-09-16).
 *
 * The scope is DERIVED from the rule's shape and is computed after the caller's fields are
 * spread in. That is not a detail: `match_scope` is a stored column defaulting to 'MINUTES',
 * `ruleFromRow` hands the stored value to `ruleFrom`, and a default applied before the spread
 * was overwritten by it — so the first version of this fix changed nothing on a phone whose
 * medicine rule predated it.
 */
describe('a care item is matched by the DAY, whatever the column says (§5b)', () => {
  const vitamin = (over: Partial<Rule> = {}) =>
    rule({
      id: 'v',
      activity: 'med',
      ruleType: 'FIXED',
      atLocalTime: '08:00',
      name: 'Vitamin D',
      careItemId: 'care-vitamin',
      ...over,
    });

  it('ignores a stored MINUTES scope on a care item and on a cadence rule', () => {
    expect(vitamin().matchScope).toBe('DAY');
    expect(vitamin({ matchScope: 'MINUTES' }).matchScope).toBe('DAY');
    expect(
      rule({ id: 'c', activity: 'bath', ruleType: 'CADENCE', everyDays: 2, matchScope: 'MINUTES' })
        .matchScope,
    ).toBe('DAY');
  });

  it('leaves everything else on the minute windows, and honors a stored DAY there', () => {
    expect(bottle13.matchScope).toBe('MINUTES');
    expect(rule({ ...bottle13, id: 'd', matchScope: 'DAY' }).matchScope).toBe('DAY');
  });

  it('calls the 8 a.m. dose given at 7:48 p.m. LATE — nearly twelve hours outside the window', () => {
    const o = fixedOccurrence(
      vitamin(),
      [sess('med', '19:48', null, { careItemId: 'care-vitamin' })],
      ctx('20:00'),
    );
    expect(o?.status).toBe('LATE');
    expect(o?.minutesLate).toBe(708);
    expect(o?.atMs).toBe(at('08:00'));
  });

  it('still says MISSED while the day has nothing logged for it', () => {
    expect(fixedOccurrence(vitamin(), [], ctx('20:00'))?.status).toBe('MISSED');
  });

  it('is not answered by another item: the cream does not give the vitamin', () => {
    const o = fixedOccurrence(
      vitamin(),
      [sess('med', '19:48', null, { careItemId: 'care-cream' })],
      ctx('20:00'),
    );
    expect(o?.status).toBe('MISSED');
  });

  it('does not reach into yesterday or tomorrow — the day is the whole window', () => {
    const yesterday = fixedOccurrence(
      vitamin(),
      [sess('med', '19:48', null, { careItemId: 'care-vitamin', dayOffset: -1 })],
      ctx('20:00'),
    );
    expect(yesterday?.status).toBe('MISSED');
  });

  it('is DONE, not LATE, inside the ordinary match window', () => {
    const o = fixedOccurrence(
      vitamin(),
      [sess('med', '08:10', null, { careItemId: 'care-vitamin' })],
      ctx('20:00'),
    );
    expect(o?.status).toBe('DONE');
  });
});
