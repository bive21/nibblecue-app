/**
 * SWITCHING FAMILY WHILE ON (`switchDuty.ts`): every branch of the duty step, and the words the
 * switcher asks with. The whole night on three phones is `scenarios/duty.scenario.test.ts` ("the
 * person on switches to another family"); the order inside `switchHousehold` is
 * `switch.scan.test.ts`.
 */
import { EMPTY_DUTY_META, type DutyShift } from '@nibblecue/core';
import { describe, expect, it, vi } from 'vitest';
import type { DutyRaw } from '../duty/view';
import { SWITCH } from './switchCopy';
import { dutyBeforeSwitch, onDutyOf, shiftsWithout, type DutyStepDeps } from './switchDuty';
import { dutyAskLines } from './switchOutcome';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 8, 3, 0); // 10 PM in Chicago
const NANA = 'nana';
const DANA = 'dana';
const SAM = 'sam';

const raw = (shifts: DutyShift[], people = PEOPLE): DutyRaw => ({
  loaded: true,
  list: { shifts, meta: { ...EMPTY_DUTY_META, rev: 'r1', by: DANA, atMs: NOW - HOUR } },
  people,
  left: [],
  lastWrite: null,
});
const PEOPLE: DutyRaw['people'] = [
  { id: DANA, name: 'Dana', role: 'OWNER' },
  { id: SAM, name: 'Sam', role: 'PARENT' },
  { id: NANA, name: 'Nana', role: 'CAREGIVER' },
];

function deps(read: DutyRaw | null | Error, online = true) {
  const handBack = vi.fn<DutyStepDeps['handBack']>(async () => undefined);
  const d: DutyStepDeps = {
    read: async () => {
      if (read instanceof Error) throw read;
      return read;
    },
    online: async () => online,
    handBack,
    now: () => NOW,
  };
  return { d, handBack };
}

describe('who is on in the family being left', () => {
  it('is the person a live shift names, now or later, and says until when', () => {
    const now = raw([{ userId: NANA, fromMs: NOW - HOUR, untilMs: NOW + 4 * HOUR }]);
    expect(onDutyOf(now, NANA, NOW)).toEqual({
      fromMs: NOW - HOUR,
      untilMs: NOW + 4 * HOUR,
      started: true,
    });
    const later = raw([
      { userId: SAM, fromMs: NOW - HOUR, untilMs: NOW + HOUR },
      { userId: NANA, fromMs: NOW + HOUR, untilMs: NOW + 6 * HOUR },
    ]);
    expect(onDutyOf(later, NANA, NOW)).toMatchObject({ started: false, fromMs: NOW + HOUR });
    expect(onDutyOf(later, DANA, NOW)).toBeNull();
  });

  it('never counts a shift that has ended, or one for somebody no longer in the family', () => {
    expect(
      onDutyOf(raw([{ userId: NANA, fromMs: NOW - 5 * HOUR, untilMs: NOW - HOUR }]), NANA, NOW),
    ).toBeNull();
    const gone = raw(
      [{ userId: NANA, fromMs: NOW - HOUR, untilMs: NOW + HOUR }],
      PEOPLE.filter(p => p.id !== NANA),
    );
    expect(onDutyOf(gone, NANA, NOW)).toBeNull();
  });

  it('hands back only this person’s shifts: the other half of a split night stays', () => {
    const split = raw([
      { userId: NANA, fromMs: NOW - HOUR, untilMs: NOW + HOUR },
      { userId: SAM, fromMs: NOW + HOUR, untilMs: NOW + 6 * HOUR },
    ]);
    expect(shiftsWithout(split, NANA, NOW)).toEqual([
      { userId: SAM, fromMs: NOW + HOUR, untilMs: NOW + 6 * HOUR },
    ]);
  });
});

describe('the duty step of a switch', () => {
  const on = raw([{ userId: NANA, fromMs: NOW - HOUR, untilMs: NOW + 4 * HOUR }]);

  it('is clear when nobody names this person, or there is no list to read', async () => {
    expect(await dutyBeforeSwitch(deps(raw([])).d, NANA, false)).toEqual({ kind: 'clear' });
    expect(await dutyBeforeSwitch(deps(null).d, NANA, true)).toEqual({ kind: 'clear' });
  });

  it('asks, and writes nothing, until the person says yes', async () => {
    const { d, handBack } = deps(on);
    expect(await dutyBeforeSwitch(d, NANA, false)).toEqual({
      kind: 'on_duty',
      duty: { fromMs: NOW - HOUR, untilMs: NOW + 4 * HOUR, started: true },
    });
    expect(handBack).not.toHaveBeenCalled();
  });

  it('a yes hands the shift back as a new list replacing the one the phone holds', async () => {
    const { d, handBack } = deps(on);
    expect(await dutyBeforeSwitch(d, NANA, true)).toMatchObject({ kind: 'handed_back' });
    expect(handBack).toHaveBeenCalledWith([], on);
  });

  it('with no connection writes nothing: the night stays this phone’s', async () => {
    const { d, handBack } = deps(on, false);
    expect(await dutyBeforeSwitch(d, NANA, true)).toMatchObject({ kind: 'offline' });
    expect(handBack).not.toHaveBeenCalled();
  });

  it('never switches on a guess: a list that cannot be read or written stops it', async () => {
    expect(await dutyBeforeSwitch(deps(new Error('db')).d, NANA, false)).toEqual({
      kind: 'failed',
    });
    const { d, handBack } = deps(on);
    handBack.mockRejectedValueOnce(new Error('refused'));
    expect(await dutyBeforeSwitch(d, NANA, true)).toEqual({ kind: 'failed' });
  });
});

describe('the question, in words', () => {
  const clock = (ms: number) => (ms === NOW + 4 * HOUR ? '2:00 AM' : '11:00 PM');

  it('names the family and when the night ends, and says where the reminders go', () => {
    expect(
      dutyAskLines(
        { name: 'Lee’s family', fromMs: NOW - HOUR, untilMs: NOW + 4 * HOUR, started: true },
        clock,
      ),
    ).toEqual({
      title: 'You’re on for Lee’s family until 2:00 AM.',
      body: 'Reminders for Lee’s family will go back to the parents’ phones.',
    });
    expect(SWITCH.onDuty.ask).toBe('Switch anyway?');
    expect(SWITCH.onDuty.confirm).toBe('Switch anyway');
  });

  it('says from when, for a night that has not started', () => {
    expect(
      dutyAskLines({ name: '', fromMs: NOW + HOUR, untilMs: NOW + 4 * HOUR, started: false }, clock)
        .title,
    ).toBe('You’re on for this family from 11:00 PM until 2:00 AM.');
  });

  it('never a dash, US English, nothing about the baby', () => {
    const all = [
      SWITCH.onDuty.title('Lee’s family', '1:00 AM', '2:00 AM', true),
      SWITCH.onDuty.title('', '1:00 AM', '2:00 AM', false),
      SWITCH.onDuty.ask,
      SWITCH.onDuty.body('Lee’s family'),
      SWITCH.onDuty.confirm,
      SWITCH.onDuty.cancel,
      SWITCH.onDuty.offline('Lee’s family'),
      SWITCH.onDuty.offline(''),
    ];
    for (const s of all) {
      expect(s, s).not.toMatch(/[‐‑‒–—―]| - /);
      expect(s.toLowerCase(), s).not.toMatch(/colour|cancelled|favourite|grey|centre/);
      expect(s.toLowerCase(), s).not.toMatch(/\b(tired|hungry|should|overdue)\b/);
    }
  });
});
