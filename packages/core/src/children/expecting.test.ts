import { describe, expect, it } from 'vitest';
import { MODULES, type ModuleId } from '../modules/module-registry';
import {
  birthOnRecordable,
  bornChildren,
  daysToDue,
  DUE_AHEAD_DAYS,
  DUE_PAST_DAYS,
  expectedChildren,
  expectedDueVerdict,
  householdExpecting,
  isBorn,
  isUnnamed,
  modulesInUse,
  UNNAMED_CHILD,
  usableBeforeBirth,
} from './expecting';

const TODAY = '2026-10-01';
const ada = { id: 'a', name: 'Ada', birth_date: '2026-06-01' };
const ben = { id: 'b', name: 'Ben', birth_date: null };
const baby = { id: 'c', name: UNNAMED_CHILD, birth_date: null };

describe('born and on the way', () => {
  it('a child with a birth date is born; one with only a due date is on the way', () => {
    expect(isBorn(ada)).toBe(true);
    expect(isBorn(ben)).toBe(false);
    expect(bornChildren([ben, ada, baby])).toEqual([ada]);
    expect(expectedChildren([ben, ada, baby])).toEqual([ben, baby]);
  });

  it('the household waits for its first baby only while no child is born', () => {
    expect(householdExpecting([])).toBe(false);
    expect(householdExpecting([ben])).toBe(true);
    expect(householdExpecting([ben, baby])).toBe(true);
    // a toddler and a baby on the way: the toddler is logged for as before
    expect(householdExpecting([ada, ben])).toBe(false);
    expect(householdExpecting([ada])).toBe(false);
  });

  it('a baby with no name yet stands in as "Baby", and only that counts as unnamed', () => {
    expect(isUnnamed(UNNAMED_CHILD)).toBe(true);
    expect(isUnnamed(' Baby ')).toBe(true);
    expect(isUnnamed('Ada')).toBe(false);
    expect(isUnnamed('Baby Ada')).toBe(false);
  });
});

describe('what a household on the way uses', () => {
  it('only the modules that belong to a person, not a baby: pumping and the milk stash', () => {
    const before = MODULES.map(m => m.id as ModuleId).filter(usableBeforeBirth);
    expect(before).toContain('pump');
    expect(before).toContain('stash');
    for (const id of [
      'breastfeed',
      'bottle',
      'diaper',
      'sleep',
      'tummy',
      'med',
      'vaccine',
    ] as const)
      expect(before, id).not.toContain(id);
  });

  it('keeps the household switches as they are, and narrows them only while expecting', () => {
    const enabled: ModuleId[] = ['breastfeed', 'pump', 'bottle', 'diaper', 'stash'];
    expect(modulesInUse(enabled, true)).toEqual(['pump', 'stash']);
    expect(modulesInUse(enabled, false)).toEqual(enabled);
    // a copy, never the household's own array
    expect(modulesInUse(enabled, false)).not.toBe(enabled);
    // a household that does not pump has nothing to log yet, which is the truth
    expect(modulesInUse(['breastfeed', 'diaper'], true)).toEqual([]);
  });
});

describe('the due date', () => {
  it('counts whole days to it, 0 on the day and negative after', () => {
    expect(daysToDue('2026-10-11', TODAY)).toBe(10);
    expect(daysToDue(TODAY, TODAY)).toBe(0);
    expect(daysToDue('2026-09-30', TODAY)).toBe(-1);
    // across a clock change it is still whole days (US DST ends 2026-11-01)
    expect(daysToDue('2026-11-03', TODAY)).toBe(33);
  });

  it('takes six weeks past to 300 days ahead, the window the server holds too', () => {
    const shift = (days: number) => {
      const d = new Date(`${TODAY}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    expect(expectedDueVerdict(shift(-DUE_PAST_DAYS), TODAY)).toBe('ok');
    expect(expectedDueVerdict(shift(-DUE_PAST_DAYS - 1), TODAY)).toBe('past');
    expect(expectedDueVerdict(shift(DUE_AHEAD_DAYS), TODAY)).toBe('ok');
    expect(expectedDueVerdict(shift(DUE_AHEAD_DAYS + 1), TODAY)).toBe('far');
    expect(expectedDueVerdict(TODAY, TODAY)).toBe('ok');
  });

  it('refuses no date, a malformed one and one that is not on the calendar', () => {
    expect(expectedDueVerdict(null, TODAY)).toBe('invalid');
    expect(expectedDueVerdict(undefined, TODAY)).toBe('invalid');
    expect(expectedDueVerdict('', TODAY)).toBe('invalid');
    expect(expectedDueVerdict('2026-1-5', TODAY)).toBe('invalid');
    expect(expectedDueVerdict('2027-02-30', TODAY)).toBe('invalid');
  });
});

describe('recording the birth', () => {
  it('takes today or a day before, within a year of the due date', () => {
    expect(birthOnRecordable(TODAY, '2026-10-20', TODAY)).toBe(true);
    expect(birthOnRecordable('2026-09-20', '2026-10-20', TODAY)).toBe(true);
    // a baby born after the due date
    expect(birthOnRecordable(TODAY, '2026-09-10', TODAY)).toBe(true);
  });

  it('refuses a day still to come, a date far from the due date, and a malformed one', () => {
    expect(birthOnRecordable('2026-10-02', '2026-10-20', TODAY)).toBe(false);
    expect(birthOnRecordable('2025-09-01', '2026-10-20', TODAY)).toBe(false);
    expect(birthOnRecordable('2026-02-30', '2026-10-20', TODAY)).toBe(false);
    expect(birthOnRecordable(null, '2026-10-20', TODAY)).toBe(false);
  });

  it('a child with no due date at all is held to the calendar only', () => {
    expect(birthOnRecordable('2020-01-01', null, TODAY)).toBe(true);
    expect(birthOnRecordable('2026-10-02', null, TODAY)).toBe(false);
  });
});
