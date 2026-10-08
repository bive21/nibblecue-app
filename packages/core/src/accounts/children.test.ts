import { describe, expect, it } from 'vitest';
import {
  checkChildCorrection,
  checkNewChild,
  copySourceFor,
  MULTIPLES_GAP_DAYS,
  suggestCopyRhythms,
} from './children';

const TODAY = '2026-09-17';

describe('a child added after setup passes the same checks setup applies', () => {
  it('needs a name and a date of birth that is not in the future', () => {
    expect(checkNewChild({ name: 'Liam', birth_date: null, due_date: null }, TODAY)).toMatchObject({
      ok: false,
      field: 'birth_date',
      reason: 'required',
    });
    expect(
      checkNewChild({ name: 'Liam', birth_date: '2026-09-18', due_date: null }, TODAY),
    ).toMatchObject({ ok: false, field: 'birth_date', reason: 'future' });
    expect(
      checkNewChild({ name: '', birth_date: '2026-06-01', due_date: null }, TODAY),
    ).toMatchObject({ ok: false, field: 'name' });
    expect(
      checkNewChild({ name: '  Liam ', birth_date: '2026-06-01', due_date: null }, TODAY),
    ).toEqual({ ok: true, value: { name: 'Liam', birth_date: '2026-06-01', due_date: null } });
  });

  it('keeps a due date within a year of the birth, as setup does', () => {
    expect(
      checkNewChild({ name: 'Liam', birth_date: '2026-06-01', due_date: '2026-07-20' }, TODAY),
    ).toMatchObject({ ok: true });
    expect(
      checkNewChild({ name: 'Liam', birth_date: '2026-06-01', due_date: '2028-01-01' }, TODAY),
    ).toMatchObject({ ok: false, field: 'due_date', reason: 'due_date.window' });
  });
});

describe('whether the new child starts with the first child’s rhythms', () => {
  it('is pre-set ON for a twin, including one who came home weeks later', () => {
    expect(suggestCopyRhythms(['2026-06-01'], '2026-06-01')).toBe(true);
    // a NICU discharge gap is days, not months; the date of birth is still the same
    expect(suggestCopyRhythms(['2026-06-01'], '2026-06-03')).toBe(true);
  });

  it('is pre-set OFF for a newborn sibling of a toddler — a toddler’s numbers are not a newborn’s', () => {
    expect(suggestCopyRhythms(['2025-03-10'], '2026-09-01')).toBe(false);
  });

  it('draws the line at one pregnancy, which no two pregnancies can fit inside', () => {
    expect(MULTIPLES_GAP_DAYS).toBe(60);
    expect(suggestCopyRhythms(['2026-06-01'], '2026-07-31')).toBe(true);
    expect(suggestCopyRhythms(['2026-06-01'], '2026-08-01')).toBe(false);
  });

  it('with two existing children, copies from the one born closest', () => {
    const kids = [
      { id: 'toddler', birth_date: '2025-03-10' },
      { id: 'twin', birth_date: '2026-06-01' },
    ];
    expect(copySourceFor(kids, '2026-06-02')?.id).toBe('twin');
    expect(copySourceFor([], '2026-06-02')).toBeNull();
    // and the suggestion is about ANY existing child, so a sibling of twins still gets OFF
    expect(
      suggestCopyRhythms(
        kids.map(k => k.birth_date),
        '2027-08-01',
      ),
    ).toBe(false);
  });
});

describe('a baby on the way, added after setup (migration 0150)', () => {
  it('takes a due date instead of a birth date, and sends no birth date', () => {
    expect(
      checkNewChild(
        { name: 'Ben', birth_date: null, due_date: '2026-12-01', expecting: true },
        TODAY,
      ),
    ).toEqual({ ok: true, value: { name: 'Ben', birth_date: null, due_date: '2026-12-01' } });
  });

  it('lets the name wait, standing in as "Baby" until the birth', () => {
    expect(
      checkNewChild(
        { name: '  ', birth_date: null, due_date: '2026-12-01', expecting: true },
        TODAY,
      ),
    ).toEqual({ ok: true, value: { name: 'Baby', birth_date: null, due_date: '2026-12-01' } });
  });

  it('holds the due date to the setup window, and ignores a birth date left in the form', () => {
    expect(
      checkNewChild({ name: 'Ben', birth_date: null, due_date: null, expecting: true }, TODAY),
    ).toMatchObject({ ok: false, field: 'due_date', reason: 'due.invalid' });
    expect(
      checkNewChild(
        { name: 'Ben', birth_date: null, due_date: '2026-07-01', expecting: true },
        TODAY,
      ),
    ).toMatchObject({ ok: false, field: 'due_date', reason: 'due.past' });
    expect(
      checkNewChild(
        { name: 'Ben', birth_date: null, due_date: '2027-09-17', expecting: true },
        TODAY,
      ),
    ).toMatchObject({ ok: false, field: 'due_date', reason: 'due.far' });
    expect(
      checkNewChild(
        { name: 'Ben', birth_date: '2026-06-01', due_date: '2026-12-01', expecting: true },
        TODAY,
      ),
    ).toMatchObject({ ok: true, value: { birth_date: null } });
  });
});

describe('a wrong date of birth can be corrected', () => {
  it('accepts a new name and a date, and derives the preterm weeks again', () => {
    expect(
      checkChildCorrection(
        { name: '  Chiara ', birth_date: '2026-03-01', due_date: '2026-04-12' },
        TODAY,
      ),
    ).toEqual({
      ok: true,
      value: { name: 'Chiara', birth_date: '2026-03-01', preterm_weeks: 6 },
    });
  });

  it('accepts a date older than two years, which setup only asks to confirm', () => {
    expect(
      checkChildCorrection({ name: 'Ada', birth_date: '2023-01-01', due_date: null }, TODAY),
    ).toMatchObject({ ok: true, value: { birth_date: '2023-01-01', preterm_weeks: null } });
  });

  it('refuses a future date, one more than eight years ago, and an empty name', () => {
    expect(
      checkChildCorrection({ name: 'Ada', birth_date: '2026-09-18', due_date: null }, TODAY),
    ).toMatchObject({ ok: false, field: 'birth_date', reason: 'future' });
    expect(
      checkChildCorrection({ name: 'Ada', birth_date: '2010-01-01', due_date: null }, TODAY),
    ).toMatchObject({ ok: false, field: 'birth_date', reason: 'too_old' });
    expect(
      checkChildCorrection({ name: '  ', birth_date: '2026-03-01', due_date: null }, TODAY),
    ).toMatchObject({ ok: false, field: 'name', reason: 'too_small' });
  });

  it('refuses a birth more than a year from the due date already on the row', () => {
    expect(
      checkChildCorrection(
        { name: 'Ada', birth_date: '2024-01-01', due_date: '2026-06-01' },
        TODAY,
      ),
    ).toMatchObject({ ok: false, field: 'birth_date', reason: 'due_date.window' });
  });
});
