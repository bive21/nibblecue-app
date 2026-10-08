/**
 * SOON (`soon.ts`; the owner, 2026-09-26): red for the week before a dose's date — the parent's
 * planned date, else the published window's opening — and calm the rest of the time. Held here:
 * both ends of the week, the planned date outranking the window, every recorded dose and every
 * past date calm, a closed window never red, and "today" taken in the zone the phone reads in.
 */
import { describe, expect, it } from 'vitest';
import { chipTone, doseTone, STATUS_TONE } from './copy';
import { addDays } from './date';
import { doseById, VACCINE_PROFILE, type DoseDisplayStatus } from './profile';
import { daysToSoonDate, isSoon, isSoonAt, SOON_DAYS, soonDate, type SoonSubject } from './soon';
import { doseStatus, type RecordLike } from './status';
import { doseWindow } from './window';

const TODAY = '2026-09-26';
/** A window opening `from` days from today and closing a month later. */
const win = (from: number, to: number | null = from + 30) => ({
  from: addDays(TODAY, from),
  to: to === null ? null : addDays(TODAY, to),
});
const open = (status: DoseDisplayStatus, from: number): SoonSubject => ({
  status,
  record: null,
  window: win(from),
});
const planned = (on: number | null, from: number): SoonSubject => ({
  status: 'PLANNED',
  record: { status: 'PLANNED', occurred_on: on === null ? null : addDays(TODAY, on) },
  window: win(from),
});

describe('the week, both ends included', () => {
  it('is today and the next seven days — not the eighth, not yesterday', () => {
    expect(SOON_DAYS).toBe(7);
    expect(isSoon(open('UPCOMING', 1), TODAY)).toBe(true);
    expect(isSoon(open('UPCOMING', 7), TODAY)).toBe(true);
    expect(isSoon(open('UPCOMING', 8), TODAY)).toBe(false);
    // the window's own opening day: DUE from today, and still inside the week
    expect(isSoon(open('DUE', 0), TODAY)).toBe(true);
    // a window that opened yesterday is calm, however long it stays open
    expect(isSoon(open('DUE', -1), TODAY)).toBe(false);
    expect(isSoon(open('DUE', -90), TODAY)).toBe(false);
  });

  it('says how far the date is, and names it', () => {
    expect(daysToSoonDate(open('UPCOMING', 5), TODAY)).toBe(5);
    expect(daysToSoonDate(open('DUE', -3), TODAY)).toBe(-3);
    expect(soonDate(open('UPCOMING', 5))).toBe('2026-10-01');
  });

  it('agrees with the status the engine derives, a real dose on every day around its window', () => {
    const dtap1 = doseById(VACCINE_PROFILE, 'dtap_1');
    if (dtap1 === undefined) throw new Error('dtap_1');
    const w = doseWindow('2026-07-26', dtap1); // 2 months: opens 2026-09-26, closes 2026-10-26
    expect(w.from).toBe(TODAY);
    const at = (today: string) => {
      const status = doseStatus({ dose: dtap1, record: null, window: w, today, tracked: true });
      return isSoon({ status, record: null, window: w }, today);
    };
    expect(at(addDays(TODAY, -8))).toBe(false); // UPCOMING, eight days out
    expect(at(addDays(TODAY, -7))).toBe(true); // UPCOMING, a week out
    expect(at(TODAY)).toBe(true); // DUE, the opening day
    expect(at(addDays(TODAY, 1))).toBe(false); // DUE, calm from the next day on
    expect(at(addDays(TODAY, 40))).toBe(false); // PAST_WINDOW
  });
});

describe('the planned date outranks the window', () => {
  it('a plan inside the week is red even when the window opens later', () => {
    expect(isSoon(planned(3, 40), TODAY)).toBe(true);
    expect(soonDate(planned(3, 40))).toBe('2026-09-29');
  });

  it('a plan outside the week is calm even when the window opens tomorrow', () => {
    expect(isSoon(planned(20, 1), TODAY)).toBe(false);
  });

  it('a plan whose day has passed is calm, whatever the window says', () => {
    expect(isSoon(planned(-1, 2), TODAY)).toBe(false);
    expect(isSoon(planned(-30, 0), TODAY)).toBe(false);
  });

  it('a plan with no date counts to the window’s opening, as the rule says', () => {
    expect(isSoon(planned(null, 4), TODAY)).toBe(true);
    expect(isSoon(planned(null, 12), TODAY)).toBe(false);
  });

  it('a parent-added plan (no published window) is soon by its own date only', () => {
    const added = (on: number | null): SoonSubject => ({
      status: 'PLANNED',
      record: { status: 'PLANNED', occurred_on: on === null ? null : addDays(TODAY, on) },
      window: null,
    });
    expect(isSoon(added(2), TODAY)).toBe(true);
    expect(isSoon(added(9), TODAY)).toBe(false);
    expect(isSoon(added(null), TODAY)).toBe(false);
  });
});

describe('never red for what is recorded, closed or past', () => {
  it('a GIVEN, SKIPPED or DECLINED dose is never soon, whatever its dates', () => {
    for (const status of ['GIVEN', 'SKIPPED', 'DECLINED'] as const) {
      const record: RecordLike = { status, occurred_on: status === 'GIVEN' ? TODAY : null };
      for (const from of [-3, 0, 1, 7])
        expect(isSoon({ status, record, window: win(from) }, TODAY), `${status} ${from}`).toBe(
          false,
        );
    }
  });

  it('an untracked dose is never soon', () => {
    expect(isSoon(open('NOT_APPLICABLE', 2), TODAY)).toBe(false);
  });

  it('PAST_WINDOW is never soon — not even if its dates were edited to look near', () => {
    expect(isSoon(open('PAST_WINDOW', -60), TODAY)).toBe(false);
    // a subject that could only come from a bug: a closed window whose opening is tomorrow
    expect(isSoon(open('PAST_WINDOW', 1), TODAY)).toBe(false);
  });

  it('no date in the past is ever soon, for any status', () => {
    const statuses: DoseDisplayStatus[] = ['PLANNED', 'DUE', 'UPCOMING', 'PAST_WINDOW'];
    for (const status of statuses)
      for (let d = -1; d >= -400; d -= 37) {
        const s: SoonSubject =
          status === 'PLANNED'
            ? { status, record: { status, occurred_on: addDays(TODAY, d) }, window: win(d) }
            : { status, record: null, window: win(d, null) };
        expect(isSoon(s, TODAY), `${status} ${d}`).toBe(false);
      }
  });
});

describe('today is the day in the zone the phone reads in', () => {
  // 03:30 UTC on the 27th is 23:30 on the 26th in New York
  const NOW = Date.parse('2026-09-27T03:30:00Z');
  const opening = (on: string): SoonSubject => ({
    status: 'UPCOMING',
    record: null,
    window: { from: on, to: null },
  });

  it('a date eight New York days away is calm there and a week away in UTC', () => {
    expect(isSoonAt(opening('2026-10-04'), 'America/New_York', NOW)).toBe(false);
    expect(isSoonAt(opening('2026-10-04'), 'UTC', NOW)).toBe(true);
  });

  it('the New York evening of the 26th still reads the 26th as today', () => {
    const s: SoonSubject = { status: 'DUE', record: null, window: { from: TODAY, to: null } };
    expect(isSoonAt(s, 'America/New_York', NOW)).toBe(true);
    // …and in UTC the 26th is already yesterday: calm, never a verdict
    expect(isSoonAt(s, 'UTC', NOW)).toBe(false);
  });
});

describe('the tone the chips take', () => {
  it('is crit while soon and the calm tone otherwise', () => {
    expect(doseTone(open('UPCOMING', 3), TODAY)).toBe('crit');
    expect(doseTone(open('UPCOMING', 30), TODAY)).toBe('info');
    expect(doseTone(open('DUE', -4), TODAY)).toBe('info');
    expect(doseTone(planned(1, 40), TODAY)).toBe('crit');
    expect(doseTone(planned(-1, 40), TODAY)).toBe('info');
  });

  it('never hands out crit for a closed window or a record, even when told the dose is soon', () => {
    expect(chipTone('PAST_WINDOW', true)).toBe('neutral');
    expect(chipTone('GIVEN', true)).toBe('good');
    expect(chipTone('SKIPPED', true)).toBe('neutral');
    expect(chipTone('DECLINED', true)).toBe('neutral');
    expect(chipTone('NOT_APPLICABLE', true)).toBe('neutral');
    for (const status of ['PLANNED', 'DUE', 'UPCOMING'] as const) {
      expect(chipTone(status, true)).toBe('crit');
      expect(chipTone(status, false)).toBe(STATUS_TONE[status]);
    }
  });
});
