/**
 * docs/VACCINES.md §11 `status.test.ts`: each of the eight statuses from its exact predicate,
 * mutual exclusivity and totality over a table of cases, a record in every status overriding
 * the profile branch, and a planned date in the past staying Planned.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { doseById, VACCINE_PROFILE, type DoseDisplayStatus } from './profile';
import { doseStatus, isOpen, isRecorded, isTracked, type RecordLike } from './status';
import { doseWindow } from './window';

const dose = (id: string) => {
  const d = doseById(VACCINE_PROFILE, id);
  if (d === undefined) throw new Error(id);
  return d;
};
const BIRTH = '2026-03-04';
const dtap1 = dose('dtap_1'); // 2–3 months: 2026-05-04 … 2026-06-04
const flu = dose('flu_annual'); // from 6 months, no end
const rv3 = dose('rv_3'); // conditional

describe('the eight statuses, each from its predicate', () => {
  const w = doseWindow(BIRTH, dtap1);
  const at = (today: string, record: RecordLike | null = null, tracked = true) =>
    doseStatus({ dose: dtap1, record, window: w, today, tracked });

  it('window predicates: UPCOMING before, DUE inside (both ends), PAST_WINDOW after', () => {
    expect(at(addDays(w.from, -1))).toBe('UPCOMING');
    expect(at(w.from)).toBe('DUE');
    expect(at(w.to ?? '')).toBe('DUE');
    expect(at(addDays(w.to ?? '', 1))).toBe('PAST_WINDOW');
  });

  it('a record of any status is the status, whatever the window says', () => {
    for (const status of ['GIVEN', 'PLANNED', 'SKIPPED', 'DECLINED'] as const) {
      for (const today of [addDays(w.from, -30), w.from, addDays(w.to ?? '', 400)]) {
        expect(at(today, { status, occurred_on: '2026-05-10' })).toBe(status);
      }
    }
  });

  it('a PLANNED date in the past is still Planned — never DUE, never PAST_WINDOW', () => {
    expect(at('2027-01-01', { status: 'PLANNED', occurred_on: '2026-05-10' })).toBe('PLANNED');
  });

  /**
   * The usual case, now that the date picker lets a parent reach it (the owner, 2026-09-18):
   * a plan is an appointment, so its date is normally ahead of today. Nothing downstream may
   * re-derive it — a dose planned for next month must not read as UPCOMING because its window
   * has not opened, nor as DUE the day the window does open, nor as PAST_WINDOW ever.
   */
  it('a PLANNED date in the FUTURE is Planned too, wherever today sits in the window', () => {
    const planned: RecordLike = { status: 'PLANNED', occurred_on: '2026-06-02' };
    for (const today of [
      addDays(w.from, -30), // before the window opens
      w.from, // the day it opens
      addDays(w.from, 10), // inside it
      addDays(w.to ?? '', 1), // after it closes
    ]) {
      expect(at(today, planned), today).toBe('PLANNED');
    }
    // a record, not an open window. The visit still stays next until it is given,
    // skipped or declined (`nextVisit.test.ts`).
    expect(isRecorded('PLANNED')).toBe(true);
    expect(isOpen('PLANNED')).toBe(false);
  });

  it('an untracked seasonal or conditional dose is NOT_APPLICABLE until turned on', () => {
    const fw = doseWindow(BIRTH, flu);
    expect(
      doseStatus({ dose: flu, record: null, window: fw, today: '2027-01-01', tracked: false }),
    ).toBe('NOT_APPLICABLE');
    expect(
      doseStatus({ dose: flu, record: null, window: fw, today: '2027-01-01', tracked: true }),
    ).toBe('DUE');
    // open-ended: PAST_WINDOW is unreachable
    expect(
      doseStatus({ dose: flu, record: null, window: fw, today: '2040-01-01', tracked: true }),
    ).toBe('DUE');
    expect(isTracked(rv3, new Set())).toBe(false);
    expect(isTracked(rv3, new Set(['rv_3']))).toBe(true);
    expect(isTracked(dtap1, new Set())).toBe(true);
  });

  it('a record on an untracked dose still shows as the record (nothing a parent entered vanishes)', () => {
    const fw = doseWindow(BIRTH, flu);
    expect(
      doseStatus({
        dose: flu,
        record: { status: 'GIVEN', occurred_on: '2026-10-01' },
        window: fw,
        today: '2026-11-01',
        tracked: false,
      }),
    ).toBe('GIVEN');
  });
});

describe('mutual exclusivity and totality', () => {
  it('exactly one status for every (dose, record, day, tracking) of a 400+ case table', () => {
    const statuses: DoseDisplayStatus[] = [
      'GIVEN',
      'PLANNED',
      'DUE',
      'UPCOMING',
      'PAST_WINDOW',
      'SKIPPED',
      'DECLINED',
      'NOT_APPLICABLE',
    ];
    const records: (RecordLike | null)[] = [
      null,
      { status: 'GIVEN', occurred_on: '2026-05-10' },
      { status: 'PLANNED', occurred_on: '2026-05-10' },
      { status: 'SKIPPED', occurred_on: null },
      { status: 'DECLINED', occurred_on: null },
    ];
    const seen = new Set<DoseDisplayStatus>();
    let cases = 0;
    for (const d of VACCINE_PROFILE.doses) {
      const w = doseWindow(BIRTH, d);
      const days = [
        addDays(w.from, -1),
        w.from,
        addDays(w.from, 10),
        w.to === null ? '2040-01-01' : addDays(w.to, 1),
      ];
      for (const record of records)
        for (const today of days)
          for (const tracked of [true, false]) {
            const s = doseStatus({ dose: d, record, window: w, today, tracked });
            expect(statuses).toContain(s);
            seen.add(s);
            cases += 1;
            // the derived predicates partition the eight
            expect(isRecorded(s) && isOpen(s)).toBe(false);
          }
    }
    expect(cases).toBeGreaterThan(400);
    expect([...seen].sort()).toEqual([...statuses].sort());
  });
});
