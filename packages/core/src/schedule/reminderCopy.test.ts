/**
 * A SET TIME'S BODY IS THE LAST ONE FROM THE LOG (the owner, 2026-10-08: "on your routine is
 * useless … it can say 'Ada slept at 8:36 PM yesterday'"), and where the log is not at hand — the
 * server's push — what it always said.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from './foresight.banned';
import { lastLoggedLine, reminderCopy, type ReminderFormat } from './reminderCopy';
import { ruleFrom, type Occurrence, type Rule } from './index';

const clock = (ms: number) => (ms === 1 ? '8:36 PM' : '11:40 AM');
const fmt = (last: { atMs: number; who: string | null } | null): ReminderFormat => ({
  clock,
  quantity: () => null,
  childName: () => null,
  multiChild: false,
  lastOf: () => last,
  dayOf: ms => (ms === 1 ? 'yesterday' : 'today'),
});
const rule = (activity: string, extra: Partial<Rule> = {}): Rule =>
  ruleFrom({
    id: 'r',
    activity: activity as Rule['activity'],
    ruleType: 'FIXED',
    atLocalTime: '19:30',
    ...extra,
  });
const slot = (r: Rule): Occurrence =>
  ({ rule: r, ruleId: r.id, atMs: 5, status: 'UPCOMING' }) as unknown as Occurrence;

describe('the last one, from the log', () => {
  it('says when the baby last slept, ate solids or fed, and when the last pump was', () => {
    expect(lastLoggedLine(rule('sleep'), fmt({ atMs: 1, who: 'Ada' }))).toBe(
      'Ada slept at 8:36 PM yesterday',
    );
    expect(lastLoggedLine(rule('solids'), fmt({ atMs: 2, who: 'Ada' }))).toBe(
      'Ada last had solids at 11:40 AM today',
    );
    expect(lastLoggedLine(rule('bottle'), fmt({ atMs: 2, who: 'Ada' }))).toBe(
      'Ada last fed at 11:40 AM today',
    );
    expect(lastLoggedLine(rule('pump'), fmt({ atMs: 2, who: null }))).toBe(
      'Last pump at 11:40 AM today',
    );
    expect(lastLoggedLine(rule('bath'), fmt({ atMs: 1, who: null }))).toBe(
      'Last bath at 8:36 PM yesterday',
    );
    expect(lastLoggedLine(rule('solids'), fmt(null))).toBe('No solids logged yet');
  });

  it('is the body of a set time with no target, and the old words where the log is not at hand', () => {
    expect(reminderCopy(slot(rule('sleep')), fmt({ atMs: 1, who: 'Ada' })).body).toBe(
      'Ada slept at 8:36 PM yesterday',
    );
    const server: ReminderFormat = {
      clock,
      quantity: () => null,
      childName: () => null,
      multiChild: false,
    };
    expect(reminderCopy(slot(rule('sleep')), server).body).toBe('On your routine');
  });

  it('carries no verdict', () => {
    for (const a of ['sleep', 'solids', 'bottle', 'pump', 'bath'])
      for (const last of [{ atMs: 1, who: 'Ada' }, null])
        expect(
          BANNED.filter(w => (lastLoggedLine(rule(a), fmt(last)) ?? '').toLowerCase().includes(w)),
          a,
        ).toEqual([]);
  });
});
