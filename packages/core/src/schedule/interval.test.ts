import { describe, expect, it } from 'vitest';
import { at, ctx, pumpEvery, rule, sess, TZ } from './fixtures';
import { intervalOccurrences, nextDue } from './interval';
import { skipKey } from './types';
import { shownAtMs } from './types';

/**
 * The rows from a time onward, at most `limit` of them. The limit exists because the walk now
 * lays out the WHOLE day (the owner, 2026-09-16), so every one of these days ends in a tail of
 * UPCOMING slots that says nothing about what is being tested; `laysOutTheRestOfTheDay` below
 * is where that tail is checked, once.
 */
const statuses = (occ: { atMs: number; status: string }[], fromHHMM = '07:00', limit = Infinity) =>
  occ
    .filter(o => o.atMs >= at(fromHHMM))
    .slice(0, limit)
    .map(o => [o.atMs, o.status] as const);

/** Every slot after the one open one is UPCOMING, and the day runs out rather than stopping. */
const laysOutTheRestOfTheDay = (occ: { atMs: number; status: string }[], openHHMM: string) => {
  const ahead = occ.filter(o => o.atMs > at(openHHMM));
  expect(ahead.length).toBeGreaterThan(0);
  expect(ahead.every(o => o.status === 'UPCOMING')).toBe(true);
  expect(occ.every(o => o.status !== 'GAP')).toBe(true);
};

/**
 * NEVER TWO OUTSTANDING SLOTS — §2's promise, and the thing the day list's new tail must not
 * break. The list runs to midnight now, so "one open slot" can no longer mean "one row that is
 * not in the past": it means exactly one slot is DUE. The rest are UPCOMING, which is a plan,
 * and a plan does not fire a reminder or color a tile.
 */
const oneOutstandingSlot = (occ: { status: string }[]) => {
  expect(occ.filter(o => o.status === 'DUE').length).toBeLessThanOrEqual(1);
};

describe('the interval engine (SCHEDULE_LOGIC §2–§3)', () => {
  it('§2 worked: 2 h from the last completed session, re-anchored to reality', () => {
    const r = pumpEvery(120, { missAfterMinutes: 60 });
    // the last session before the day anchors the walk; three overnight slots pass unmet
    const prior = sess('pump', '21:00', '21:15', { dayOffset: -1 });
    const res = intervalOccurrences(
      r,
      [prior, sess('pump', '07:15'), sess('pump', '11:20')],
      ctx('11:30'),
    );
    // §2's table, read at 11:30. The prior session anchors on its START (21:00), so the morning
    // slot is 07:00 and the 07:15 session takes it 15 minutes inside the match window. The 09:15
    // slot passed unlogged and SAYS SO: it used to fold into a GAP row once 11:20 answered the
    // chain, and the day then never named it (the owner, 2026-09-16).
    expect(statuses(res.occurrences, '07:00', 4)).toEqual([
      [at('07:00'), 'DONE'],
      [at('09:15'), 'MISSED'],
      [at('11:15'), 'DONE'],
      [at('13:20'), 'UPCOMING'],
    ]);
    expect(res.next?.atMs).toBe(at('13:20'));
    // four: 01:00, 03:00 and 05:00 overnight, then 09:15. They are real slots that passed
    // with nothing logged; the GAP row used to hide them behind a count.
    expect(res.missedToday).toBe(4);
    oneOutstandingSlot(res.occurrences);
    laysOutTheRestOfTheDay(res.occurrences, '13:20');
    // the overnight slots are the day's too, each on its own row rather than summarised
    expect(statuses(res.occurrences, '00:00', 3)).toEqual([
      [at('01:00'), 'MISSED'],
      [at('03:00'), 'MISSED'],
      [at('05:00'), 'MISSED'],
    ]);
    expect(res.occurrences.every(o => o.atMs >= at('00:00'))).toBe(true);
    expect(res.extra).toEqual([]);
  });

  it('§2 the same day at 10:30, before the next session: the slot IS outstanding', () => {
    const r = pumpEvery(120, { missAfterMinutes: 60 });
    const prior = sess('pump', '21:00', '21:15', { dayOffset: -1 });
    // nothing since 07:15, so 09:15 is a miss the household has not answered — it stands
    const res = intervalOccurrences(r, [prior, sess('pump', '07:15')], ctx('10:30'));
    // 11:15 is still ahead of the clock, and it is due: the 09:15 miss has not been answered
    // (the owner, 2026-10-04). The rest of the day stays a plan.
    expect(statuses(res.occurrences, '07:00', 3)).toEqual([
      [at('07:00'), 'DONE'],
      [at('09:15'), 'MISSED'],
      [at('11:15'), 'DUE'],
    ]);
    expect(res.missedToday).toBe(4); // 01:00 · 03:00 · 05:00 overnight, then 09:15
    laysOutTheRestOfTheDay(res.occurrences, '11:15');
  });

  it('§2 the early session IS the occurrence, off-grid, and re-anchors — nothing is left standing', () => {
    const r = pumpEvery(120);
    const prior = sess('pump', '21:00', '21:15', { dayOffset: -1 });
    const res = intervalOccurrences(
      r,
      [prior, sess('pump', '07:15'), sess('pump', '08:32')],
      ctx('09:00'),
    );
    expect(statuses(res.occurrences, '07:00', 3)).toEqual([
      [at('07:00'), 'DONE'],
      [at('08:32'), 'DONE'],
      [at('10:32'), 'UPCOMING'],
    ]);
    expect(res.occurrences.find(o => o.atMs === at('08:32'))?.offGrid).toBe(true);
    expect(res.occurrences.some(o => o.atMs === at('09:15'))).toBe(false);
  });

  /**
   * THE ANCHOR IS THE SESSION'S START, for every activity — §2's original "the end" reversed by
   * the owner on 2026-09-16 ("use the start time for the calculation … this applies to schedule
   * timing too"). "Every two hours" is start-to-start, so how long the pump ran cannot move the
   * next slot: a 15-minute session and a 45-minute one begun at the same moment are due again at
   * the same moment.
   */
  it('§2 the anchor is the session’s START: the length of the session never moves the next slot', () => {
    const r = pumpEvery(120);
    expect(intervalOccurrences(r, [sess('pump', '07:00', '07:15')], ctx('08:00')).next?.atMs).toBe(
      at('09:00'),
    );
    expect(intervalOccurrences(r, [sess('pump', '07:00', '07:45')], ctx('08:00')).next?.atMs).toBe(
      at('09:00'),
    );
    // and an instant entry, which has no end at all, lands in the same place
    expect(intervalOccurrences(r, [sess('pump', '07:00')], ctx('08:00')).next?.atMs).toBe(
      at('09:00'),
    );
  });

  it('§3 LATE inside the late window, with minutes_late, and the next slot anchored to the session', () => {
    const r = pumpEvery(120, { lateWindowMinutes: 90 });
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '09:55')],
      ctx('10:30'),
    );
    const late = res.occurrences.find(o => o.atMs === at('09:15'));
    expect(late?.status).toBe('LATE');
    expect(late?.minutesLate).toBe(40);
    expect(res.next?.atMs).toBe(at('11:55'));
  });

  /**
   * A FOUR-HOUR RULE, so ninety minutes is genuinely inside half the interval. `lateOf` now
   * clamps a late window to half a rule's own cadence (the audit's B1, and `types.ts` says why):
   * on the two-hourly rule this case used to use, a ninety-minute window reached past the
   * midpoint into the next slot's half, which is the thing that clamp exists to stop.
   */
  it('§3 the late window is exclusive at its end: a session at due + late is an extra, the slot MISSED', () => {
    const r = pumpEvery(240, { lateWindowMinutes: 90, missAfterMinutes: 60 });
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '12:45')],
      ctx('17:00'),
    );
    // 12:45 = 11:15 + 90: NOT late for 11:15 — nothing ever satisfies that slot — and it is
    // early for 15:15, so it becomes that occurrence off-grid instead
    expect(res.occurrences.some(o => o.atMs === at('11:15') && o.matchedId !== null)).toBe(false);
    expect(res.occurrences.find(o => o.atMs === at('12:45'))?.offGrid).toBe(true);
    // the 11:15 slot stands as MISSED: a later session re-anchors the chain, it does not rewrite
    // what already happened (the owner, 2026-09-16 — it used to collapse into a GAP row)
    expect(res.occurrences.find(o => o.atMs === at('11:15'))?.status).toBe('MISSED');
    expect(res.occurrences.some(o => o.status === 'GAP')).toBe(false);
  });

  /**
   * FOURTEEN HOURS WITH NOTHING LOGGED IS FOURTEEN HOURS OF ROWS, each one a slot that passed.
   * They used to stop at six and fold the rest into a GAP that re-anchored the chain to "now",
   * which meant the open slot was an hour and a half from whenever you happened to look rather
   * than on the rhythm you set. The chain keeps its cadence now, and the list keeps its rows
   * (the owner, 2026-09-16: "it should mark the 8am and 10am as missed").
   */
  it('§3 a long silence: every slot that passed is its own MISSED row, and the cadence holds', () => {
    const r = pumpEvery(90, { missAfterMinutes: 45 });
    const res = intervalOccurrences(r, [sess('pump', '00:10')], ctx('14:00'));
    const after = res.occurrences.filter(o => o.atMs > at('00:10'));
    // 01:40 · 03:10 · 04:40 · 06:10 · 07:40 · 09:10 · 10:40 · 12:10 — every 90 minutes from the
    // one session, up to the last whose miss window has closed
    expect(after.filter(o => o.status === 'MISSED').map(o => o.atMs)).toEqual([
      at('01:40'),
      at('03:10'),
      at('04:40'),
      at('06:10'),
      at('07:40'),
      at('09:10'),
      at('10:40'),
      at('12:10'),
    ]);
    expect(res.occurrences.some(o => o.status === 'GAP')).toBe(false);
    // 13:40 is on the rhythm and its miss window is still open, so it is the one DUE slot
    expect(res.next?.atMs).toBe(at('13:40'));
    expect(res.next?.status).toBe('DUE');
    laysOutTheRestOfTheDay(res.occurrences, '13:40');
  });

  /**
   * THE DAY IS MIDNIGHT TO MIDNIGHT, and its grid does not open ON midnight. With no session to
   * anchor to, the walk used to start at `dayStart - every`, so the first slot landed exactly on
   * midnight for every interval module, every morning (the owner, 2026-09-16: "why is there a
   * 12.00 AM time for every module when it's way past that").
   *
   * …BUT THE NIGHT BETWEEN TWO SUCH DAYS IS FILLED (the owner, 2026-09-27; `gridFills`, and
   * `wrap.test.ts` for the rest). The grid still starts one interval in — 2:00 AM — and
   * yesterday's ended at 10:00 PM: four hours on a two-hour rule, so one slot goes between them,
   * and the middle of 10:00 PM and 2:00 AM is midnight. This test pinned "never midnight" until
   * then; the slot is back at 12:00 AM only where the rhythm itself puts it — a two-and-a-half-hour
   * rule's is 12:30 AM, and setup's rhythm's is 12:30 AM too.
   */
  it('§2 a day with nothing logged at all: the grid one interval in, the night before it filled', () => {
    const r = pumpEvery(120, { missAfterMinutes: 60 });
    const res = intervalOccurrences(r, [], ctx('09:00'));
    // the wrap's slot, then the grid from 2:00
    expect(res.occurrences[0]?.atMs).toBe(at('00:00'));
    expect(res.occurrences[1]?.atMs).toBe(at('02:00'));
    expect(statuses(res.occurrences, '00:00', 6).map(([, st]) => st)).toEqual([
      'MISSED', // 00:00 — the slot between yesterday's 22:00 and today's 02:00
      'MISSED', // 02:00
      'MISSED', // 04:00
      'MISSED', // 06:00
      'DUE', // 08:00 — its miss window is still open at 09:00
      'UPCOMING', // 10:00, and on to the end of the day
    ]);
    // ... and it runs to the end of the day: 10:00, 12:00, … 22:00 — tonight's midnight is tomorrow's
    expect(res.occurrences[res.occurrences.length - 1]?.atMs).toBe(at('22:00'));
    // a grid that does not divide the night is filled where its middle falls, not on the boundary
    const twoAndAHalf = intervalOccurrences(pumpEvery(150), [], ctx('09:00'));
    expect(twoAndAHalf.occurrences[0]?.atMs).toBe(at('00:30'));
    expect(twoAndAHalf.occurrences.some(o => o.atMs === at('00:00'))).toBe(false);
  });

  it('sessions that match no slot are extra, never a miss', () => {
    const r = pumpEvery(120);
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '07:40')],
      ctx('08:00'),
    );
    // 07:40 is inside the 07:15 anchor's shadow: not early (it is after the anchor, but the next
    // slot 09:15 − 25 is 08:50, so it IS early) — it becomes the occurrence, and nothing is extra
    expect(res.extra).toEqual([]);
    expect(res.next?.atMs).toBe(at('09:40'));
  });

  it('a running timer restarts the interval from its START, and stopping it changes nothing (AT-4.5)', () => {
    // AT-4.5 used to say the opposite: a running timer restarted nothing, because the chain
    // restarted at a session's END and a session still running has none. Since the anchor became
    // the START (`intervalAnchor`), the running session has everything the chain needs — so the
    // next pump moves the moment the timer is tapped, not when it is stopped (the owner,
    // 2026-09-16). The two halves below now agree, which is the point: starting and stopping the
    // same session can never produce two different next slots.
    const r = pumpEvery(180);
    const running = sess('pump', '10:20', null, { running: true });
    const before = intervalOccurrences(r, [sess('pump', '07:15'), running], ctx('10:30'));
    expect(before.occurrences.find(o => o.atMs === at('10:15'))?.status).toBe('DONE');
    expect(before.next?.atMs).toBe(at('13:20'));
    expect(before.next?.status).toBe('UPCOMING');
    const stopped = sess('pump', '10:20', '10:50', { id: running.id });
    const after = intervalOccurrences(r, [sess('pump', '07:15'), stopped], ctx('10:55'));
    expect(after.occurrences.find(o => o.atMs === at('10:15'))?.status).toBe('DONE');
    // three hours from when it BEGAN (10:20), not from when it was stopped
    expect(after.next?.atMs).toBe(at('13:20'));
    oneOutstandingSlot(after.occurrences);
  });

  it('a skipped slot keeps the cadence like a miss, and never notifies again', () => {
    const r = pumpEvery(120);
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15')],
      ctx('09:30', { skipped: new Set([`${r.id}@${at('09:15')}`]) }),
    );
    expect(res.occurrences.find(o => o.atMs === at('09:15'))?.status).toBe('SKIPPED');
    expect(res.next?.atMs).toBe(at('11:15'));
    // a skip answers the series, so the slot after waits for its clock
    expect(res.next?.status).toBe('UPCOMING');
  });

  it('a log after a miss puts the slot after that log back on its clock', () => {
    const r = pumpEvery(120, { missAfterMinutes: 60 });
    const prior = sess('pump', '21:00', '21:15', { dayOffset: -1 });
    // 10:20 is after 09:15's window has closed, and early for 11:15, so it becomes the row
    // and the chain restarts from it. The slot after that one waits for its clock.
    const logged = intervalOccurrences(
      r,
      [prior, sess('pump', '07:15'), sess('pump', '10:20')],
      ctx('10:30'),
    );
    expect(logged.occurrences.find(o => o.atMs === at('09:15'))?.status).toBe('MISSED');
    expect(logged.next).toMatchObject({ atMs: at('12:20'), status: 'UPCOMING' });
    expect(logged.occurrences.filter(o => o.status === 'DUE')).toHaveLength(0);
  });
});

describe('feeding as an interval (the owner, 2026-09-15)', () => {
  const feedEvery = (minutes: number): ReturnType<typeof rule> =>
    rule({ id: 'r-feed', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: minutes });

  it('counts from the START of a feed: planned 2:00, fed 2:45, next 5:45 — not 5:00', () => {
    const r = feedEvery(180);
    const res = intervalOccurrences(
      r,
      [sess('bottle', '11:00'), sess('breastfeed', '14:45', '15:05')],
      ctx('15:30'),
    );
    expect(statuses(res.occurrences, '11:00', 3)).toEqual([
      [at('11:00'), 'DONE'],
      [at('14:00'), 'LATE'],
      [at('17:45'), 'UPCOMING'],
    ]);
  });

  it('either kind of feed satisfies it and re-anchors it; a pump never does', () => {
    const r = feedEvery(180);
    const res = intervalOccurrences(
      r,
      [
        sess('breastfeed', '07:00', '07:20'),
        sess('pump', '10:00', '10:15'),
        sess('bottle', '10:05'),
      ],
      ctx('10:30'),
    );
    // the 07:00 breastfeed lands late on the 06:00 grid slot and re-anchors from its START:
    // the next slot is 10:00, not 10:20; the 10:05 bottle takes it, and the pump is nobody's
    expect(statuses(res.occurrences, '06:00', 3)).toEqual([
      [at('06:00'), 'LATE'],
      [at('10:00'), 'DONE'],
      [at('13:05'), 'UPCOMING'],
    ]);
    expect(res.extra).toEqual([]);
  });

  it('a pump interval counts from the START too — one rule for every activity', () => {
    const res = intervalOccurrences(pumpEvery(120), [sess('pump', '07:00', '07:15')], ctx('08:00'));
    expect(res.next?.atMs).toBe(at('09:00'));
  });
});

describe('nights (§4)', () => {
  const night = (extra: Parameters<typeof pumpEvery>[1]) =>
    pumpEvery(180, { nightFrom: '23:00', nightTo: '06:00', ...extra });

  it('PAUSE: pump 22:40 → next 06:00; the 01:40 and 04:40 slots are never created', () => {
    const r = night({ nightMode: 'PAUSE' });
    expect(nextDue(at('22:40'), r, TZ)).toBe(at('06:00', 1));
    const res = intervalOccurrences(
      r,
      [sess('pump', '22:40', null, { dayOffset: -1 })],
      ctx('05:00'),
    );
    expect(res.occurrences.filter(o => o.status === 'MISSED')).toHaveLength(0);
    expect(res.next?.atMs).toBe(at('06:00'));
  });

  it('LONGER: 3 h by day, 4 h by night — 22:40 → 02:40 → 06:50 → 10:00', () => {
    const r = night({ nightMode: 'LONGER', nightEveryMinutes: 240 });
    expect(nextDue(at('22:40'), r, TZ)).toBe(at('02:40', 1));
    expect(nextDue(at('02:50', 1), r, TZ)).toBe(at('06:50', 1));
    expect(nextDue(at('07:00', 1), r, TZ)).toBe(at('10:00', 1));
  });

  it('ONE: a single slot at 03:00, then nothing until the window ends', () => {
    const r = night({ nightMode: 'ONE', nightAt: '03:00' });
    expect(nextDue(at('22:40'), r, TZ)).toBe(at('03:00', 1));
    // the one session happened (a little early, resolving the 03:00 slot); the next is the
    // window end, not tomorrow's 03:00
    expect(nextDue(at('02:50', 1), r, TZ, at('03:00', 1))).toBe(at('06:00', 1));
    const res = intervalOccurrences(
      r,
      [sess('pump', '22:40', null, { dayOffset: -1 }), sess('pump', '02:30')],
      ctx('05:00'),
    );
    expect(res.occurrences.slice(0, 2).map(o => [o.atMs, o.status])).toEqual([
      [at('02:30'), 'DONE'],
      [at('06:00'), 'UPCOMING'],
    ]);
    // once the day-step lands past the window, it is just the day-step
    expect(nextDue(at('03:05', 1), r, TZ)).toBe(at('06:05', 1));
  });

  it('NONE: the same interval around the clock', () => {
    const r = night({ nightMode: 'NONE' });
    expect(nextDue(at('22:40'), r, TZ)).toBe(at('01:40', 1));
  });
});

describe('acceptance test 4 @AT-04 — interval reminders from the last completed session (node half)', () => {
  const r = rule({ id: 'r8', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 180 });

  it('4.1 a session BEGUN 11:50 → one open slot at 14:50', () => {
    const res = intervalOccurrences(r, [sess('pump', '11:50', '12:07')], ctx('12:30'));
    expect(res.next?.atMs).toBe(at('14:50'));
    oneOutstandingSlot(res.occurrences);
  });

  it('4.2 then a session begun 12:45 → the slot moves to 15:45; never two open', () => {
    const res = intervalOccurrences(
      r,
      [sess('pump', '11:50', '12:07'), sess('pump', '12:45', '13:00')],
      ctx('13:10'),
    );
    expect(res.next?.atMs).toBe(at('15:45'));
    oneOutstandingSlot(res.occurrences);
  });

  it('4.3 7:15 then 10:32 → the 10:15 slot is DONE (17 min inside the window); next 13:32', () => {
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '10:32')],
      ctx('10:40'),
    );
    expect(res.occurrences.find(o => o.atMs === at('10:15'))?.status).toBe('DONE');
    expect(res.next?.atMs).toBe(at('13:32'));
  });

  it('4.4 7:15 then 11:05 → the 10:15 slot is LATE by 50 (inside the 90-minute late window); next 14:05', () => {
    // NOTIFICATIONS.md wrote MISSED here before the late window existed; SCHEDULE_LOGIC §3 is the
    // authority: a session after the match window but inside the late window satisfies the slot
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '11:05')],
      ctx('11:10'),
    );
    const slot = res.occurrences.find(o => o.atMs === at('10:15'));
    expect(slot?.status).toBe('LATE');
    expect(slot?.minutesLate).toBe(50);
    expect(res.next?.atMs).toBe(at('14:05'));
  });

  it('4.6 a backdated session earlier than the anchor never drags the next slot backwards', () => {
    const sessions = [sess('pump', '11:50', '12:07'), sess('pump', '11:00', '11:10')];
    const res = intervalOccurrences(r, sessions, ctx('12:30'));
    expect(res.next?.atMs).toBe(at('14:50'));
    expect(res.next!.atMs).toBeGreaterThan(at('12:30'));
  });
});

/**
 * A DAY THAT BEGINS WHEN THE HOUSEHOLD DOES, and one correction that stands alone.
 *
 * Both come from one afternoon on the owner's phone (2026-09-18), and they are the two halves of
 * the same complaint: a schedule that describes hours the household did not exist for, and a
 * schedule that rewrites itself wholesale when one thing is logged.
 */
describe('a brand-new household, and the slot a session displaces', () => {
  it('lays the first day out from midnight, and skips what came before signup', () => {
    // "i also created a new account so everything is new at 3.30PM… the today's schedule i see
    // only start from 5.30PM why does this happen? why not just start when user creates accoutn"
    // (2026-09-18) — answered since 2026-09-25 by the day every other day is: "It should still
    // show from midnight in case if user wants to 'fix' the schedule"
    const r = pumpEvery(150); // the owner's two and a half hours
    const signedUp = ctx('15:44', { trackingFromMs: at('15:30') });
    const res = intervalOccurrences(r, [], signedUp);
    expect(statuses(res.occurrences, '00:00')).toEqual([
      [at('02:30'), 'SKIPPED'],
      [at('05:00'), 'SKIPPED'],
      [at('07:30'), 'SKIPPED'],
      [at('10:00'), 'SKIPPED'],
      [at('12:30'), 'SKIPPED'],
      [at('15:00'), 'SKIPPED'],
      [at('17:30'), 'UPCOMING'],
      [at('20:00'), 'UPCOMING'],
      [at('22:30'), 'UPCOMING'],
    ]);
    // every skip before 3:30 is the engine's, not the parent's…
    expect(res.occurrences.filter(o => o.atMs < at('15:30')).every(o => o.beforeStart)).toBe(true);
    // …and none of the day is spent telling them they missed something they could not have done
    expect(res.occurrences.some(o => o.status === 'MISSED')).toBe(false);
    expect(res.missedToday).toBe(0);
    expect(res.next?.atMs).toBe(at('17:30'));
  });

  it('re-anchors on an entry backdated to before signup, and strikes nothing through', () => {
    // "account created at 3.18pm… if user decides to put last log entry (for example feeding
    // was done at 1.50pm), make sure this is updated in the schedule… so 4.50pm next"
    const r = pumpEvery(180);
    const fed = sess('pump', '13:50', '14:00');
    const res = intervalOccurrences(r, [fed], ctx('15:20', { trackingFromMs: at('15:18') }));
    const done = res.occurrences.find(o => o.status === 'DONE');
    expect(done?.atMs).toBe(at('13:50'));
    expect(done?.offGrid).toBe(true);
    const open = res.occurrences.filter(o => o.status === 'UPCOMING' || o.status === 'DUE');
    expect(open[0]?.atMs).toBe(at('16:50'));
    // the 3:00 PM slot it displaced was one with nothing logged behind it, so no row says "was"
    expect(res.occurrences.every(o => o.movedFromMs === null)).toBe(true);
    expect(res.extra).toHaveLength(0);
  });

  it('still lays out the whole day from midnight once there is any history', () => {
    // a real entry is a better anchor than a signup, and outranks it
    const r = pumpEvery(150);
    const prior = sess('pump', '23:00', '23:10', { dayOffset: -1 });
    const res = intervalOccurrences(r, [prior], ctx('15:44', { trackingFromMs: at('15:30') }));
    expect(res.occurrences.some(o => o.atMs < at('15:30'))).toBe(true);
  });

  it('marks only the slot a session displaced, never the ones after it', () => {
    // "show the change only for the single affected schedule, so it should show 5.30PM
    // strikethroughed 6.13PM. and then the next ones should still be every 2,5hours so 8.43 and
    // dont strikthgouh this one, otherwise there will be too much edit"
    const r = pumpEvery(150, { matchWindowMinutes: 30, lateWindowMinutes: 90 });
    const signedUp = ctx('16:05', { trackingFromMs: at('13:00') });
    // the day's grid is 15:00, 17:30 and 20:00 (from midnight, 12:30 and before skipped as before
    // signup); a pump at 15:40 answers the 15:00 slot late
    const logged = sess('pump', '15:40', '15:52');
    const res = intervalOccurrences(r, [logged], signedUp);
    const moved = res.occurrences.filter(o => o.movedFromMs !== null);
    expect(moved).toHaveLength(1);
    // the one that moved is the next slot, and it says where it came from
    expect(moved[0]?.atMs).toBe(at('18:10'));
    expect(moved[0]?.movedFromMs).toBe(at('17:30'));
    // everything after it simply is where it is
    const after = res.occurrences.filter(o => o.atMs > at('18:10'));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(o => o.movedFromMs === null)).toBe(true);
  });

  it('says nothing about a move that did not happen', () => {
    // a session on its own slot keeps the grid, so there is nothing to strike
    const r = pumpEvery(150, { matchWindowMinutes: 30 });
    const onTime = sess('pump', '15:00', '15:10');
    const res = intervalOccurrences(r, [onTime], ctx('16:00', { trackingFromMs: at('13:00') }));
    expect(res.occurrences.find(o => o.atMs === at('15:00'))?.status).toBe('DONE');
    expect(res.occurrences.every(o => o.movedFromMs === null)).toBe(true);
  });
});

/**
 * THE SCHEDULE AUDIT, 2026-09-19 — the four defects it reproduced against the real engine and
 * the two states it found questionable. Each one is the scenario it ran, kept as the test.
 */
describe('the chain reads its day in order, and only the slot that moved says so', () => {
  it('A1: a run of misses between a re-anchor and the open slot carries no "was"', () => {
    // pump at 07:20 with no prior session, looked at in the middle of the afternoon: the
    // re-anchor's moved-from used to survive every MISSED row and land on the 3:20 PM slot
    const r = pumpEvery(120);
    const res = intervalOccurrences(r, [sess('pump', '07:20')], ctx('15:00'));
    for (const o of res.occurrences) {
      if (o.movedFromMs === null) continue;
      const prev = res.occurrences[res.occurrences.indexOf(o) - 1];
      expect(prev?.status === 'DONE' || prev?.status === 'LATE').toBe(true);
    }
  });

  it('A3: a rule whose last session is weeks old still lays out a whole day', () => {
    // the walk is capped at 200 steps, so a 2-hourly chain anchored 20 days back never arrived
    const r = pumpEvery(120);
    const res = intervalOccurrences(
      r,
      [sess('pump', '10:00', null, { dayOffset: -20 })],
      ctx('09:00'),
    );
    expect(res.occurrences.length).toBeGreaterThan(8);
    expect(res.next).not.toBeNull();
    // and the phase the household ran on is kept: a chain on the hour is still on the hour
    expect(new Date(res.occurrences[0]!.atMs).getUTCMinutes()).toBe(0);
  });

  it('A5: an early session before an in-window one is still an occurrence, in time order', () => {
    // pumps at 08:00 and 09:10 against a 09:15 slot: 09:10 took the slot and 08:00 was left
    // over as an "extra", so the day counted two pumps out of three
    const r = pumpEvery(120);
    const res = intervalOccurrences(
      r,
      [sess('pump', '07:15'), sess('pump', '08:00'), sess('pump', '09:10')],
      ctx('10:00'),
    );
    expect(res.extra).toEqual([]);
    expect(res.doneToday).toBe(3);
  });

  it('A6: a rule written at four in the afternoon does not grid from midnight', () => {
    const r = pumpEvery(180, { effectiveFromMs: at('16:00') });
    const res = intervalOccurrences(r, [], {
      ...ctx('16:05'),
      trackingFromMs: at('09:00', -30),
    });
    // the rule was written into a household thirty days old, so its first slot is fifteen
    // minutes in, then its own interval — never a phase laid down from midnight (a household's
    // own first day is different: `firstDay.test.ts`)
    expect(res.occurrences[0]?.atMs).toBe(at('16:15'));
    expect(res.occurrences[1]?.atMs).toBe(at('19:15'));
  });

  it('A7: a second entry minutes after the first is one entry, and does not move the chain', () => {
    const r = pumpEvery(120);
    const res = intervalOccurrences(
      r,
      [sess('pump', '05:10'), sess('pump', '07:15'), sess('pump', '07:20')],
      ctx('08:00'),
    );
    expect(res.doneToday).toBe(2);
    expect(res.extra).toEqual([]);
    // the chain runs from 07:15, not from 07:20 — no "~~9:15~~ 9:20"
    expect(res.next?.atMs).toBe(at('09:15'));
    expect(res.next?.movedFromMs).toBe(null);
  });

  it('B5: the morning after a paused night is due, never missed', () => {
    // pumping paused 23:00–06:00, last pump at 22:40, the household wakes at half past seven
    const r = pumpEvery(180, { nightMode: 'PAUSE', nightFrom: '23:00', nightTo: '06:00' });
    const res = intervalOccurrences(
      r,
      [sess('pump', '22:40', null, { dayOffset: -1 })],
      ctx('07:30'),
    );
    expect(res.occurrences[0]).toMatchObject({ status: 'DUE' });
    expect(res.missedToday).toBe(0);
  });

  /**
   * THE EVENING ON THE PHONE (2026-10-03). Setup's rhythm: 3 h by day, 4 h from 7:30 PM to
   * 7:00 AM. A pump at 1:05 makes the next slot 4:05, logged at 5:31, which is 86 min late and
   * still inside the 90 min window. The day step from 5:31 would land at 8:31, inside the night,
   * so the night's 4 h applies and the chain's next reading is 9:31. A timer still running from
   * 6:58 is early for that slot, so it becomes the row and the chain restarts at 6:58: the slot
   * that was going to be 1:31 AM is now 10:58 PM, 153 min earlier. Stopping the timer later does
   * not move it again, because the anchor is the start.
   */
  it('a running 6:58 pump moves 1:31 AM to 10:58 PM, 153 min earlier', () => {
    const r = pumpEvery(180, {
      nightMode: 'LONGER',
      nightEveryMinutes: 240,
      nightFrom: '19:30',
      nightTo: '07:00',
    });
    const running = sess('pump', '18:58', null, { running: true });
    const res = intervalOccurrences(
      r,
      [sess('pump', '13:05', '13:35'), sess('pump', '17:31', '18:01'), running],
      ctx('18:59'),
    );
    expect(res.occurrences.find(o => o.matchedAtMs === at('17:31'))).toMatchObject({
      atMs: at('16:05'),
      status: 'LATE',
      minutesLate: 86,
    });
    expect(res.occurrences.find(o => o.matchedId === running.id)).toMatchObject({
      atMs: at('18:58'),
      status: 'DONE',
      offGrid: true,
    });
    expect(res.next).toMatchObject({
      atMs: at('22:58'),
      movedFromMs: at('01:31', 1),
      status: 'UPCOMING',
    });
    const shift = Math.round((at('22:58') - at('01:31', 1)) / 60_000);
    expect(shift).toBe(-153);
  });

  it('B6: a timer that is still running does not miss its own slots', () => {
    // a pump started at 13:26 and still going at 19:13 drew `3:56 PM MISSED` and `6:26 PM DUE`
    // beside a card that said "Pumping"
    const r = pumpEvery(150);
    const res = intervalOccurrences(
      r,
      [sess('pump', '13:26', null, { running: true })],
      ctx('19:13'),
    );
    const after = res.occurrences.filter(o => o.atMs > at('13:26'));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(o => o.status === 'UPCOMING')).toBe(true);
  });

  it('a shift of a few minutes is not worth a strikethrough', () => {
    const r = pumpEvery(150, { matchWindowMinutes: 30 });
    const res = intervalOccurrences(
      r,
      // the day's grid is 15:00, 17:30, 20:00; a pump five minutes early keeps the grid
      [sess('pump', '14:55')],
      ctx('16:00', { trackingFromMs: at('13:00') }),
    );
    expect(res.occurrences.find(o => o.atMs === at('15:00'))?.status).toBe('DONE');
    expect(res.occurrences.every(o => o.movedFromMs === null)).toBe(true);
  });
});

/**
 * WHEN A ROW HAPPENED (`shownAtMs`; the owner, 2026-09-24). A session inside the window keeps
 * its slot on the grid — `atMs` is the planned minute — and says when it really started through
 * `matchedAtMs`; an early one IS the slot, at its own minute. Every surface a person reads asks
 * `shownAtMs`, so both read the minute they were logged.
 */
describe('shownAtMs — the minute a done slot is shown at', () => {
  it('is the logged minute for a slot answered inside its window, and the grid for the rest', () => {
    const r = pumpEvery(120, { missAfterMinutes: 60 });
    const prior = sess('pump', '21:00', '21:15', { dayOffset: -1 });
    const res = intervalOccurrences(r, [prior, sess('pump', '07:15')], ctx('08:00'));
    const hit = res.occurrences.find(o => o.atMs === at('07:00'));
    expect(hit?.status).toBe('DONE');
    // planned 7:00, logged 7:15: the grid keeps 7:00, a person reads 7:15
    expect(hit?.matchedAtMs).toBe(at('07:15'));
    expect(hit && shownAtMs(hit)).toBe(at('07:15'));
    // a slot nobody answered reads its own minute
    const open = res.occurrences.find(o => o.status === 'UPCOMING');
    expect(open && shownAtMs(open)).toBe(open?.atMs);
  });
});

/**
 * A SLOT FROM BEFORE MIDNIGHT THAT IS STILL OPEN (the schedule sweep of 2026-09-24). The day's
 * list is midnight to midnight; the one open slot is not, and Today reads it from `carried`.
 */
describe('the open slot before midnight is handed back while it is still due', () => {
  // three-hourly, missed ninety minutes after the slot: the last pump at 8:05 PM puts the open
  // slot at 11:05 PM, and its window runs to 12:35 AM
  const r = pumpEvery(180, { missAfterMinutes: 90 });
  const evening = sess('pump', '20:05', null, { dayOffset: -1 });

  it('at 12:05 AM it is carried, DUE, and not on the day’s own list', () => {
    const res = intervalOccurrences(r, [evening], ctx('00:05'));
    expect(res.carried).toMatchObject({ atMs: at('23:05', -1), status: 'DUE' });
    expect(res.occurrences.every(o => o.atMs >= at('00:00'))).toBe(true);
    // the day's chain still runs from it: 2:05 AM is the day's first slot
    expect(res.occurrences[0]).toMatchObject({ atMs: at('02:05'), status: 'UPCOMING' });
  });

  it('once its window has closed it is nobody’s: missed, and not carried', () => {
    const res = intervalOccurrences(r, [evening], ctx('00:40'));
    expect(res.carried).toBeNull();
    // the miss is unanswered, so 2:05 is due now rather than a countdown to its clock
    expect(res.occurrences[0]).toMatchObject({ atMs: at('02:05'), status: 'DUE' });
  });

  it('a pump at 12:10 AM answers it, late, and the chain runs from 12:10', () => {
    const res = intervalOccurrences(r, [evening, sess('pump', '00:10')], ctx('00:15'));
    expect(res.carried).toBeNull();
    expect(res.next).toMatchObject({ atMs: at('03:10'), status: 'UPCOMING' });
  });

  it('a skip of it is honored', () => {
    const res = intervalOccurrences(r, [evening], {
      ...ctx('00:05'),
      skipped: new Set([skipKey(r.id, at('23:05', -1))]),
    });
    expect(res.carried).toBeNull();
  });

  it('a day that has not begun carries nothing (tomorrow, read at 9 PM)', () => {
    const tomorrow = { ...ctx('21:00', {}), dayStartMs: at('00:00', 1) };
    expect(intervalOccurrences(r, [sess('pump', '20:05')], tomorrow).carried).toBeNull();
  });

  it('a last pump weeks back still lays out the day, and carries nothing stale', () => {
    const res = intervalOccurrences(
      r,
      [sess('pump', '10:00', null, { dayOffset: -20 })],
      ctx('09:00'),
    );
    expect(res.carried).toBeNull();
    expect(res.occurrences.length).toBeGreaterThan(4);
  });
});
