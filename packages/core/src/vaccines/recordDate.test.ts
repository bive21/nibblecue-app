/**
 * docs/VACCINES.md §4 and §6 over `recordDate.ts`: which of the four record statuses may carry
 * a date that has not happened yet, and what an in-progress sheet keeps when the parent
 * changes the status under it.
 *
 * The defect these pin (the owner, 2026-09-18, on an Android phone): "planned meaning it will
 * happen in the future, but this is blocked in the calendar". The rule is per status, not per
 * picker — and it cuts both ways, because the sheets that did not block a future date would
 * record a dose as GIVEN on a day nobody has lived through.
 */
import { describe, expect, it } from 'vitest';
import {
  allowsFutureDate,
  clampRecordDate,
  isRecordDateAllowed,
  latestRecordDate,
} from './recordDate';
import type { VaccineRecordStatus } from './status';

const TODAY = '2026-09-18';
const TOMORROW = '2026-09-19';
const NEXT_MONTH = '2026-10-20';
const YESTERDAY = '2026-09-17';
const ALL: VaccineRecordStatus[] = ['GIVEN', 'PLANNED', 'SKIPPED', 'DECLINED'];

describe('which statuses may carry a date that has not happened', () => {
  it('PLANNED may, and it is the only one that may', () => {
    expect(ALL.filter(allowsFutureDate)).toEqual(['PLANNED']);
  });

  it('PLANNED has no latest date; every other status stops at today', () => {
    expect(latestRecordDate('PLANNED', TODAY)).toBeNull();
    for (const status of ALL.filter(s => s !== 'PLANNED')) {
      expect(latestRecordDate(status, TODAY), status).toBe(TODAY);
    }
  });

  it('a planned date is allowed tomorrow, next month, today and in the past alike', () => {
    for (const date of [TOMORROW, NEXT_MONTH, TODAY, YESTERDAY, '2026-01-01']) {
      expect(isRecordDateAllowed('PLANNED', date, TODAY), date).toBe(true);
    }
  });

  it('a given date is allowed up to and including today, and no further', () => {
    expect(isRecordDateAllowed('GIVEN', YESTERDAY, TODAY)).toBe(true);
    expect(isRecordDateAllowed('GIVEN', TODAY, TODAY)).toBe(true);
    expect(isRecordDateAllowed('GIVEN', TOMORROW, TODAY)).toBe(false);
    expect(isRecordDateAllowed('GIVEN', NEXT_MONTH, TODAY)).toBe(false);
  });
});

describe('what a sheet keeps when the parent changes the status under it', () => {
  it('Planned → Given moves a date that has not happened back to today', () => {
    expect(clampRecordDate('GIVEN', NEXT_MONTH, TODAY)).toBe(TODAY);
    expect(clampRecordDate('GIVEN', TOMORROW, TODAY)).toBe(TODAY);
  });

  it('and never touches a date the status may carry — the parent’s own date survives', () => {
    expect(clampRecordDate('GIVEN', YESTERDAY, TODAY)).toBe(YESTERDAY);
    expect(clampRecordDate('GIVEN', TODAY, TODAY)).toBe(TODAY);
    expect(clampRecordDate('PLANNED', NEXT_MONTH, TODAY)).toBe(NEXT_MONTH);
    // §4 invariant 1: a planned date that has passed is the parent's, and stays theirs
    expect(clampRecordDate('PLANNED', '2026-01-01', TODAY)).toBe('2026-01-01');
  });

  it('is idempotent, so a second status change cannot walk the date anywhere', () => {
    for (const status of ALL) {
      const once = clampRecordDate(status, NEXT_MONTH, TODAY);
      expect(clampRecordDate(status, once, TODAY), status).toBe(once);
    }
  });
});
