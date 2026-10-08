import { describe, expect, it } from 'vitest';
import { adherence } from './adherence';
import { at, ctx, pumpEvery, rule, sess } from './fixtures';
import { listedToday, nextEvent, nextInterval, openToday, scheduleDay } from './today';

const bottle = (id: string, atLocalTime: string) =>
  rule({ id, activity: 'bottle', ruleType: 'FIXED', atLocalTime });

describe('the day, all rules together (SCHEDULE_LOGIC §3, NOTIFICATIONS §4)', () => {
  it('@AT-05 5.3 two slots in window: the nearest wins; the other is untouched', () => {
    const day = scheduleDay(
      [bottle('a', '12:30'), bottle('b', '13:00')],
      [sess('bottle', '12:50', null, { id: 'x' })],
      ctx('13:10'),
    );
    const byRule = Object.fromEntries(day.occurrences.map(o => [o.ruleId, o]));
    expect(byRule['b']).toMatchObject({ status: 'DONE', matchedId: 'x' });
    expect(byRule['a']).toMatchObject({ status: 'DUE', matchedId: null });
  });

  it('@AT-05 5.6 bottles at 12:50 and 13:05: the first takes the slot, the second is an extra, never a re-match', () => {
    const day = scheduleDay(
      [bottle('b', '13:00')],
      [
        sess('bottle', '12:50', null, { id: 'first' }),
        sess('bottle', '13:05', null, { id: 'second' }),
      ],
      ctx('14:00'),
    );
    expect(day.occurrences[0]).toMatchObject({ status: 'DONE', matchedId: 'first' });
    expect(day.extras.map(s => s.id)).toEqual(['second']);
  });

  it('a session claims at most one slot even when two rules could take it', () => {
    const day = scheduleDay(
      [bottle('a', '13:00'), bottle('b', '13:10')],
      [sess('bottle', '13:04', null, { id: 'x' })],
      ctx('16:00'),
    );
    const matched = day.occurrences.filter(o => o.matchedId === 'x');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.ruleId).toBe('a'); // 4 minutes away beats 6
    expect(day.occurrences.find(o => o.ruleId === 'b')?.status).toBe('MISSED');
  });

  it('a rule on a disabled module is hidden; a paused rule too', () => {
    const paused = rule({ ...bottle('p', '09:00'), isActive: false });
    const day = scheduleDay([bottle('a', '13:00'), paused, pumpEvery(180)], [], ctx('10:00'), {
      enabled: a => a !== 'pump',
    });
    expect(day.occurrences.map(o => o.ruleId)).toEqual(['a']);
  });

  it('lists today without GAP rows or look-aheads, and NEXT is the earliest still to come', () => {
    const bath = rule({
      id: 'bath',
      activity: 'bath',
      ruleType: 'CADENCE',
      everyDays: 2,
      atLocalTime: '18:30',
    });
    const day = scheduleDay(
      [bottle('a', '13:00'), bottle('b', '16:00'), bath],
      [sess('bath', '07:00')],
      ctx('10:00'),
    );
    expect(listedToday(day).every(o => !o.future)).toBe(true);
    expect(day.occurrences.some(o => o.future)).toBe(true);
    expect(nextEvent(day)?.ruleId).toBe('a');
  });

  /**
   * TODAY IS A WORKING SURFACE; THE SCHEDULE TAB IS A RECORD. The owner asked for both, in that
   * order (2026-09-16: first "it should mark the 8am and 10am as missed", then "I just logged
   * the bottle at 2.03 and the time now is 2.05 — it should remove the mark and move on"), and
   * they are not in conflict: the day's list keeps every missed slot, and Today carries what is
   * still open.
   */
  describe('openToday — a miss the household has logged past is history', () => {
    it('drops the morning’s misses the moment the chain moves on, and keeps the list whole', () => {
      const r = pumpEvery(120, { missAfterMinutes: 60 });
      // nothing until 14:03, so 02:00 · 04:00 … 12:00 all passed; then one session
      const day = scheduleDay([r], [sess('pump', '14:03')], ctx('14:05'));
      const missedInList = listedToday(day).filter(o => o.status === 'MISSED');
      expect(missedInList.length).toBeGreaterThan(3); // the record keeps every one of them
      // ... and Today has none left: the 14:03 session answered the chain
      expect(openToday(day).filter(o => o.status === 'MISSED')).toEqual([]);
      // what survives is what is still to come, the 16:03 slot first
      expect(openToday(day).find(o => o.status !== 'DONE')?.atMs).toBe(at('16:03'));
    });

    it('keeps a miss nothing has answered: tummy time nobody did all day', () => {
      const tummy = rule({
        id: 'tummy',
        activity: 'tummy',
        ruleType: 'INTERVAL',
        everyMinutes: 240,
        missAfterMinutes: 60,
      });
      const pump = pumpEvery(120, { missAfterMinutes: 60 });
      const day = scheduleDay([tummy, pump], [sess('pump', '14:03')], ctx('14:05'));
      const open = openToday(day);
      // the pump's morning is gone, the tummy time's is not — nothing has answered it
      expect(open.filter(o => o.status === 'MISSED').every(o => o.ruleId === 'tummy')).toBe(true);
      expect(open.some(o => o.status === 'MISSED')).toBe(true);
    });

    /**
     * A CARE ITEM IS ONE SERIES, however many rules its reminder times are. This test used to
     * hold the opposite — "is per RULE, so a later dose never answers an earlier one" — and the
     * owner overturned it from the device (2026-09-16: "for eczema cream that should be done 3
     * times a day, if it's missed then just move on to next entry … I can't apply twice at the
     * same time as that would be pointless. Just mark the first one as missed and log my entry
     * to the closest schedule"). Which is right: a dose you cannot give twice is not
     * outstanding work, it is a record, and the record is what `listedToday` draws.
     */
    it('is per SERIES: one dose closes the item’s earlier misses on Today, never on the list', () => {
      const cream = ['08:00', '14:00', '20:00'].map((atLocalTime, i) =>
        rule({
          id: `cream-${i}`,
          activity: 'med',
          ruleType: 'FIXED',
          atLocalTime,
          careItemId: 'cream',
        }),
      );
      // six in the evening, the day's first and only application
      // a care entry carries the item it was for, and a care-item rule only takes its own
      const dose = sess('med', '18:00', null, { id: 'dose', careItemId: 'cream' });
      const day = scheduleDay(cream, [dose], ctx('18:05'));
      const listed = listedToday(day);
      // it took the nearest slot it had REACHED — 2 p.m., not the 8 p.m. still to come
      expect(listed.find(o => o.ruleId === 'cream-1')?.matchedId).toBe('dose');
      // the day's list keeps the morning's miss, because the list is the record
      expect(listed.find(o => o.ruleId === 'cream-0')?.status).toBe('MISSED');
      // Today does not: there is nothing left to do about it, and the evening slot is what is
      const open = openToday(day);
      expect(open.some(o => o.ruleId === 'cream-0')).toBe(false);
      expect(open.find(o => o.ruleId === 'cream-2')?.status).toBe('UPCOMING');
    });

    it('keeps the item’s miss that came AFTER its last dose', () => {
      const cream = ['08:00', '14:00'].map((atLocalTime, i) =>
        rule({
          id: `cream-${i}`,
          activity: 'med',
          ruleType: 'FIXED',
          atLocalTime,
          careItemId: 'cream',
        }),
      );
      // the morning dose was given; the afternoon one was not, and it is four o'clock
      const day = scheduleDay(
        cream,
        [sess('med', '08:05', null, { careItemId: 'cream' })],
        ctx('16:00'),
      );
      expect(openToday(day).find(o => o.ruleId === 'cream-1')?.status).toBe('MISSED');
    });

    /**
     * TUMMY TIME REACHES THE SAME RULE BY THE SAME ROUTE. It is a count per day now (the owner,
     * 2026-09-16: "tummy time should not be set every x hours, but rather how many times done in
     * a day. just like 3 times a day medication cream"), so it is several DAY-scoped FIXED rules
     * with no care item — and `seriesKey` groups them by activity. Nothing about tummy time is
     * special-cased in the engine: the scope is the fact, and the fact is on the rule.
     */
    it('is per SERIES for a DAY-scoped activity with no item: tummy time’s three times', () => {
      const tummy = ['09:00', '13:00', '17:00'].map((atLocalTime, i) =>
        rule({
          id: `tummy-${i}`,
          activity: 'tummy',
          ruleType: 'FIXED',
          atLocalTime,
          matchScope: 'DAY',
          childId: 'emma',
        }),
      );
      // one go, late in the afternoon, after two slots have passed
      const day = scheduleDay(
        tummy,
        [sess('tummy', '16:30', '16:40', { childId: 'emma' })],
        ctx('18:00'),
      );
      expect(listedToday(day).filter(o => o.status === 'MISSED')).toHaveLength(1); // the record
      expect(openToday(day).some(o => o.status === 'MISSED')).toBe(false); // the working surface
    });

    it('keeps two babies’ tummy time apart: Emma’s go says nothing about Liam’s', () => {
      const mk = (childId: string, i: number, atLocalTime: string) =>
        rule({
          id: `${childId}-${i}`,
          activity: 'tummy',
          ruleType: 'FIXED',
          atLocalTime,
          matchScope: 'DAY',
          childId,
        });
      const rules = [mk('emma', 0, '09:00'), mk('emma', 1, '15:00'), mk('liam', 0, '09:00')];
      const day = scheduleDay(
        rules,
        [sess('tummy', '15:05', '15:15', { childId: 'emma' })],
        ctx('18:00'),
      );
      const open = openToday(day).filter(o => o.status === 'MISSED');
      expect(open.map(o => o.ruleId)).toEqual(['liam-0']);
    });

    /**
     * SET TIMES ARE ONE SERIES TOO (the owner, 2026-09-19: "let users to create customized daily
     * schedule too that they can use for everyday's schedule instead of interval"). They are
     * MINUTES-scoped — a 10:00 feed is the 10:00 feed, and a feed at noon answers neither 10:00
     * nor 13:00 — but a household that fed at 13:05 has moved on from 10:00 exactly as the cream
     * household moved on from 8 a.m. Keyed on the rule, the 10:00 miss stayed red on Today all
     * afternoon; keyed on the routine it is history, and the record keeps it.
     */
    it('is per SERIES for set times: the 1 p.m. feed closes the missed 10 a.m. on Today only', () => {
      const feeds = ['07:00', '10:00', '13:00', '16:00'].map(t => bottle(`feed-${t}`, t));
      const day = scheduleDay(
        feeds,
        [sess('bottle', '07:05'), sess('breastfeed', '13:05')],
        ctx('14:00'),
      );
      const listed = listedToday(day);
      // the scope is honest: nothing answered 10:00, and the breastfeed took 13:00
      expect(listed.find(o => o.ruleId === 'feed-10:00')?.status).toBe('MISSED');
      expect(listed.find(o => o.ruleId === 'feed-13:00')?.status).toBe('DONE');
      // Today has moved on; 16:00 is what is left
      const open = openToday(day);
      expect(open.some(o => o.ruleId === 'feed-10:00')).toBe(false);
      expect(open.find(o => o.ruleId === 'feed-16:00')?.status).toBe('UPCOMING');
    });

    it('a set time is not closed by a session that has not reached the next one', () => {
      const feeds = ['07:00', '10:00', '13:00'].map(t => bottle(`feed-${t}`, t));
      // fed at 07:05, then nothing: at noon the 10:00 miss is still the thing to act on
      const day = scheduleDay(feeds, [sess('bottle', '07:05')], ctx('12:00'));
      expect(openToday(day).find(o => o.ruleId === 'feed-10:00')?.status).toBe('MISSED');
    });

    it('a bedtime and a nap are one sleep routine; an interval is always its own', () => {
      const nap = rule({ id: 'nap', activity: 'sleep', ruleType: 'FIXED', atLocalTime: '13:00' });
      const bed = rule({
        id: 'bed',
        activity: 'sleep',
        ruleType: 'FIXED',
        atLocalTime: '19:30',
        name: 'Bedtime',
      });
      const pump = pumpEvery(180, { missAfterMinutes: 60 });
      const day = scheduleDay(
        [nap, bed, pump],
        [sess('sleep', '19:35', null, { sleepKind: 'NIGHT' })],
        ctx('20:00'),
      );
      const open = openToday(day);
      // the missed nap is history once the night has begun
      expect(open.some(o => o.ruleId === 'nap')).toBe(false);
      // the pump chain, untouched by any of it, still has its own miss standing
      expect(open.some(o => o.ruleId === 'r-pump' && o.status === 'MISSED')).toBe(true);
    });

    it('one item’s dose says nothing about another item’s miss', () => {
      const cream = rule({
        id: 'cream',
        activity: 'med',
        ruleType: 'FIXED',
        atLocalTime: '08:00',
        careItemId: 'cream',
      });
      const drops = rule({
        id: 'drops',
        activity: 'med',
        ruleType: 'FIXED',
        atLocalTime: '09:00',
        careItemId: 'drops',
      });
      const day = scheduleDay(
        [cream, drops],
        [sess('med', '14:00', null, { careItemId: 'cream' })],
        ctx('18:00'),
      );
      // the cream's morning slot was answered by the cream's own dose; the drops are untouched
      expect(
        openToday(day)
          .filter(o => o.status === 'MISSED')
          .map(o => o.ruleId),
      ).toEqual(['drops']);
    });
  });

  it('the pump card: the interval rule’s next slot, what it was measured from, and today’s misses', () => {
    const r = pumpEvery(180, { nightMode: 'PAUSE', nightFrom: '23:00', nightTo: '06:00' });
    const prior = sess('pump', '21:45', '22:00', { dayOffset: -1 });
    const card = nextInterval(
      r,
      [prior, sess('pump', '07:00', '07:15'), sess('pump', '10:20', '10:42')],
      ctx('11:00'),
    );
    expect(card).toMatchObject({
      // three hours from when the 10:20 session BEGAN, not from when it was stopped at 10:42
      atMs: at('13:20'),
      status: 'UPCOMING',
      lastMs: at('10:20'),
      everyMinutes: 180,
      missedToday: 0,
    });
  });

  /**
   * ADHERENCE IS COUNTS OVER THE WHOLE DAY, now that the day is the whole day. `scheduled` used
   * to stop at the one open slot plus whatever a GAP row stood for; it is every slot the plan
   * lays out, so "1 of 16" means "one done, sixteen planned" rather than "one done out of
   * however far the list happened to reach".
   */
  it('adherence is counts only, over every slot the day lays out', () => {
    const r = pumpEvery(90, { missAfterMinutes: 45 });
    const day = scheduleDay([r], [sess('pump', '00:10')], ctx('14:00'));
    const a = adherence(day.occurrences);
    expect(a.expectedFromGaps).toBe(0); // nothing collapses any more
    expect(a.done).toBe(1); // the 00:10 session, off-grid, is the occurrence
    expect(a.missed).toBe(8); // 01:40 … 12:10, every 90 minutes, each its own row
    const ahead = day.occurrences.filter(o => o.status === 'UPCOMING').length;
    expect(a.scheduled).toBe(1 + 8 + 1 + ahead); // done, the misses, the DUE slot, the rest
    expect(day.occurrences.filter(o => o.status === 'DUE')).toHaveLength(1);
  });
});

describe('a household that is one minute old has missed nothing (effective_from)', () => {
  /**
   * The owner's fresh account at 10:52 showed three rows reading `9:00 AM · not logged`. The
   * rules had been written at 10:51. `effective_from` exists for exactly this and was honored in
   * `fixed.ts` alone, so a FIXED slot was dropped and an INTERVAL or a CADENCE one was not —
   * which is why the tests below run the same morning past all three kinds.
   */
  const setUpAt = at('10:51');

  it('drops a fixed slot from before the rule was written', () => {
    const day = scheduleDay(
      [
        bottle('morning', '09:00'),
        rule({ id: 'later', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '14:00' }),
      ],
      [],
      ctx('10:52'),
    );
    expect(day.occurrences.map(o => o.ruleId)).toContain('morning');

    const fresh = scheduleDay(
      [
        bottle('morning', '09:00'),
        rule({ id: 'later', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '14:00' }),
      ].map(r => ({ ...r, effectiveFromMs: setUpAt })),
      [],
      ctx('10:52'),
    );
    expect(fresh.occurrences.map(o => o.ruleId)).toEqual(['later']);
  });

  it('drops the interval slots from before it too — the kind that reached the owner', () => {
    const every3h = pumpEvery(180, { effectiveFromMs: setUpAt });
    const day = scheduleDay([every3h], [], ctx('10:52'));
    expect(day.occurrences.every(o => o.atMs >= setUpAt)).toBe(true);
    expect(day.occurrences.some(o => o.status === 'MISSED')).toBe(false);
  });

  it('drops a cadence slot from before it', () => {
    const vitamin = rule({
      id: 'vit',
      activity: 'med',
      ruleType: 'CADENCE',
      atLocalTime: '09:00',
      everyDays: 1,
      effectiveFromMs: setUpAt,
    });
    expect(scheduleDay([vitamin], [], ctx('10:52')).occurrences).toEqual([]);
  });

  it('keeps every slot of a rule that has been there all along', () => {
    // the guard may only ever remove what predates the rule: a household on its second day has
    // a real 9 a.m. miss, and losing it would be the far worse bug of the two
    const day = scheduleDay([bottle('morning', '09:00')], [], ctx('10:52'));
    expect(day.occurrences).toHaveLength(1);
    expect(day.occurrences[0]).toMatchObject({ ruleId: 'morning', status: 'MISSED' });
  });
});

/**
 * YOU CANNOT MISS BREAKFAST IF YOU GAVE BREAKFAST (the owner, 2026-09-19, with solids logged at
 * 11:15 against a 9:15 slot: "it says that it's already missed but still showing in next
 * activities, and the solid module in quick log is red bordered with ! Missed").
 *
 * One boundary caused all three. `withinSlot` stops matching past `lateWindowMinutes` — 90 by
 * default — so an entry two hours behind its slot matched nothing, the slot went MISSED (which
 * is why it stayed in Up next and reddened the tile), and the parent's own entry became an
 * unmatched extra. `today.ts` gives such a slot a second look before calling it missed.
 */
describe('a slot answered later the same day is late, never missed', () => {
  const solids = (id: string, atLocalTime: string) =>
    rule({ id, activity: 'solids', ruleType: 'FIXED', atLocalTime });

  it('the owner’s case: 9:15 breakfast, logged 11:15, two hours past the late window', () => {
    const day = scheduleDay(
      [solids('breakfast', '09:15')],
      [sess('solids', '11:15', null, { id: 'logged' })],
      ctx('12:00'),
    );
    const o = day.occurrences[0];
    expect(o).toMatchObject({ status: 'LATE', matchedId: 'logged' });
    expect(o?.minutesLate).toBe(120);
    // and the entry the parent made is not also floating as an unmatched extra
    expect(day.extras).toEqual([]);
    // which is what takes it out of Up next and off the tile: both read MISSED, and it is not
    expect(listedToday(day).some(x => x.status === 'MISSED')).toBe(false);
  });

  it('is still MISSED when the day ends with nothing logged', () => {
    const day = scheduleDay([solids('breakfast', '09:15')], [], ctx('23:00'));
    expect(day.occurrences[0]).toMatchObject({ status: 'MISSED', matchedId: null });
  });

  /**
   * THE SECOND PASS NEVER REACHES ACROSS MIDNIGHT. The day is the bound — a slot is asking "was
   * this done today?", and yesterday's breakfast is not answered by this morning's.
   */
  it('does not let the next day’s entry answer yesterday’s slot', () => {
    const day = scheduleDay(
      [solids('breakfast', '09:15')],
      [sess('solids', '09:20', null, { id: 'tomorrow', dayOffset: 1 })],
      ctx('23:00'),
    );
    expect(day.occurrences[0]).toMatchObject({ status: 'MISSED', matchedId: null });
  });

  /**
   * AND IT CHANGES NOTHING ABOUT THE FIRST PASS. One application at 10 a.m. on a three-a-day
   * cream still answers the 8 a.m. slot it reached rather than the 2 p.m. one it did not — the
   * case the assignment loop's own comment records (the owner, 2026-09-16). What is different
   * is only that a slot with an unclaimed later entry is no longer called missed.
   */
  it('leaves the three-a-day cream exactly as it was', () => {
    const med = (id: string, atLocalTime: string) =>
      rule({ id, activity: 'med', ruleType: 'FIXED', atLocalTime });
    const day = scheduleDay(
      [med('m1', '08:00'), med('m2', '14:00'), med('m3', '20:00')],
      [sess('med', '10:00', null, { id: 'once' })],
      ctx('15:00'),
    );
    const byRule = Object.fromEntries(day.occurrences.map(o => [o.ruleId, o]));
    expect(byRule['m1']).toMatchObject({ matchedId: 'once' });
    // the 2 p.m. slot is still outstanding: one dose does not answer two
    expect(byRule['m2']?.matchedId).toBeNull();
    expect(byRule['m3']).toMatchObject({ status: 'UPCOMING', matchedId: null });
  });

  it('gives one later entry to the earliest slot waiting for it, never to two', () => {
    const day = scheduleDay(
      [solids('a', '08:00'), solids('b', '12:00')],
      [sess('solids', '15:00', null, { id: 'one' })],
      ctx('16:00'),
    );
    const matched = day.occurrences.filter(o => o.matchedId === 'one');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.ruleId).toBe('a');
    expect(day.occurrences.find(o => o.ruleId === 'b')?.status).toBe('MISSED');
  });
});

/**
 * YOU CANNOT MISS BEDTIME IF YOU PUT THE BABY DOWN EARLY (the owner, 2026-09-20, at 20:31 with
 * the sleep already logged) — and the audit's A2, which is the same boundary on a set feeding
 * time. A MINUTES-scoped slot reached ninety minutes forward and twenty-five back; it now
 * reaches the same distance both ways, bounded by the previous slot of its own series.
 */
describe('a slot answered a little early', () => {
  const fixed = (id: string, activity: 'sleep' | 'bottle', atLocalTime: string) =>
    rule({ id, activity, ruleType: 'FIXED', atLocalTime });

  it('a bedtime at 21:00 is DONE when the baby went down at 20:32', () => {
    const day = scheduleDay(
      [fixed('bed', 'sleep', '21:00')],
      [sess('sleep', '20:32', null, { sleepKind: 'NIGHT', running: true })],
      ctx('20:35'),
    );
    expect(day.occurrences.find(o => o.ruleId === 'bed')).toMatchObject({ status: 'DONE' });
    expect(day.extras).toEqual([]);
  });

  it('a set feeding time at 10:00 is DONE when the feed was at 09:30, and stays so all morning', () => {
    const day = scheduleDay(
      [fixed('f10', 'bottle', '10:00'), fixed('f13', 'bottle', '13:00')],
      [sess('breastfeed', '09:30')],
      ctx('12:00'),
    );
    expect(day.occurrences.find(o => o.ruleId === 'f10')).toMatchObject({ status: 'DONE' });
    expect(openToday(day).find(o => o.ruleId === 'f10')?.status).toBe('DONE');
  });

  it('but a NAP slot hours behind does not swallow the early bedtime', () => {
    // the rescue passes reach in opposite directions; the early one runs first for exactly this
    const day = scheduleDay(
      [fixed('nap', 'sleep', '15:00'), fixed('bed', 'sleep', '21:00')],
      [sess('sleep', '20:32', null, { sleepKind: 'NIGHT', running: true })],
      ctx('20:35'),
    );
    expect(day.occurrences.find(o => o.ruleId === 'bed')).toMatchObject({ status: 'DONE' });
    expect(day.occurrences.find(o => o.ruleId === 'nap')?.status).toBe('MISSED');
  });

  it('and the reach is bounded: a 5 p.m. nap does not answer a 9 p.m. bedtime', () => {
    const day = scheduleDay(
      [fixed('bed', 'sleep', '21:00')],
      [sess('sleep', '17:00', '17:45', { sleepKind: 'NAP' })],
      ctx('21:05'),
    );
    expect(day.occurrences.find(o => o.ruleId === 'bed')?.status).toBe('DUE');
  });

  it('an unmatched BREASTFEED against set BOTTLE times is at least an extra', () => {
    // `fixedActivities` asked for the session's own activity, so a breastfeed on a bottle-timed
    // household fell out of the day's accounting entirely (the audit's A2b)
    // five hours before the only slot, so neither rescue can reach it: unclaimed, and it has to
    // land in the day's accounting somewhere rather than vanishing from it
    const day = scheduleDay(
      [fixed('f10', 'bottle', '10:00')],
      [sess('breastfeed', '05:00', null, { id: 'nowhere' })],
      ctx('11:31'),
    );
    expect(day.occurrences.find(o => o.ruleId === 'f10')?.status).toBe('MISSED');
    expect(day.extras.map(e => e.id)).toContain('nowhere');
  });
});

describe('one entry, one row (the audit A4)', () => {
  it('a feed cannot close both a feeding interval and a set time at the same moment', () => {
    const iv = rule({ id: 'iv', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 });
    const fx = rule({ id: 'fx', activity: 'bottle', ruleType: 'FIXED', atLocalTime: '10:00' });
    const day = scheduleDay(
      [iv, fx],
      [sess('bottle', '07:00'), sess('breastfeed', '10:05', null, { id: 'one-feed' })],
      ctx('11:00'),
    );
    const matched = day.occurrences.filter(o => o.matchedId === 'one-feed');
    expect(matched).toHaveLength(1);
    // the set time keeps the row: it names the moment, where the interval names the rhythm
    expect(matched[0]?.ruleId).toBe('fx');
  });
});
