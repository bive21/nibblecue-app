import { describe, expect, it } from 'vitest';
import {
  GOAL_MINUTE_CHOICES,
  GOAL_MINUTES_MAX,
  goalChoicesFor,
  graduationSettings,
  PLAYTIME_GOAL_CHOICES,
  type GoalSettings,
  goalADayLabel,
  goalLine,
  goalPairLine,
  goalMinutesLabel,
  goalProgress,
  goalSpoken,
  goalTodayLine,
  isGoalMinutes,
} from './goal';

describe('a daily goal is arithmetic over the household’s own minutes', () => {
  it('fills the bar as a fraction of the goal and stops at full', () => {
    expect(goalProgress(0, 15)).toBe(0);
    expect(goalProgress(3, 15)).toBeCloseTo(0.2);
    expect(goalProgress(15, 15)).toBe(1);
    // a day past its goal is a full bar, not an overflowing one — the words carry the record
    expect(goalProgress(22, 15)).toBe(1);
  });

  it('never divides by nothing', () => {
    expect(goalProgress(10, 0)).toBe(0);
    expect(goalProgress(10, -5)).toBe(0);
    expect(goalProgress(Number.NaN, 15)).toBe(0);
  });

  /**
   * THREE, NOT SEVEN (the owner, 2026-09-19: "tummy time also the range is too close and too
   * much, just do 15m a day, 30 min, 1hour , or custom"). Seven chips from five minutes to an
   * hour is a row and a half of near-neighbours, and the difference between 15 and 20 is not a
   * decision anybody makes. Custom reaches every minute between and beyond.
   */
  it('offers four round numbers a person would say, in order, inside the column’s bound', () => {
    expect([...GOAL_MINUTE_CHOICES]).toEqual([5, 15, 30, 60]);
    for (const n of GOAL_MINUTE_CHOICES) expect(isGoalMinutes(n)).toBe(true);
    expect(GOAL_MINUTE_CHOICES.every(n => n <= GOAL_MINUTES_MAX)).toBe(true);
    // each is plainly a different answer from the one before it, which is what the trim is for
    for (let i = 1; i < GOAL_MINUTE_CHOICES.length; i += 1) {
      expect(
        (GOAL_MINUTE_CHOICES[i] as number) / (GOAL_MINUTE_CHOICES[i - 1] as number),
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('accepts only a positive whole number of minutes inside the bound', () => {
    expect(isGoalMinutes(15)).toBe(true);
    expect(isGoalMinutes(0)).toBe(false);
    expect(isGoalMinutes(-1)).toBe(false);
    expect(isGoalMinutes(7.5)).toBe(false);
    expect(isGoalMinutes(GOAL_MINUTES_MAX + 1)).toBe(false);
    expect(isGoalMinutes(null)).toBe(false);
    expect(isGoalMinutes('15')).toBe(false);
  });
});

describe('the words on the card', () => {
  it('writes minutes compactly and hours with a two-digit remainder', () => {
    expect(goalMinutesLabel(0)).toBe('0m');
    expect(goalMinutesLabel(12)).toBe('12m');
    expect(goalMinutesLabel(60)).toBe('1h');
    expect(goalMinutesLabel(65)).toBe('1h 05m');
    expect(goalMinutesLabel(12.6)).toBe('13m');
  });

  it('says what today holds, what the goal is, and reads them out in that order', () => {
    expect(goalTodayLine(1)).toBe('1m today');
    expect(goalTodayLine(0)).toBe('0m today');
    expect(goalLine(15)).toBe('15m goal');
    expect(goalPairLine(5, 60)).toBe('5m / 1h goal');
    expect(goalPairLine(0, 15)).toBe('0m / 15m goal');
    expect(goalADayLabel(30)).toBe('30m a day');
    expect(goalSpoken('Tummy time', 4, 15)).toBe('Tummy time, 4m today, 15m goal');
  });

  /**
   * NOTHING HERE IS A VERDICT. The lines state two numbers; a reader compares them. The words
   * that would turn the comparison into a claim about the baby are the ones CLAUDE.md §2 rule 3
   * forbids, and this pins that none of them can come out of this file.
   */
  it('never describes a shortfall', () => {
    const lines = [
      goalTodayLine(1),
      goalLine(15),
      goalPairLine(1, 15),
      goalADayLabel(15),
      goalSpoken('Tummy time', 1, 15),
    ];
    for (const line of lines)
      expect(line).not.toMatch(/behind|short|not enough|should|need|left|remaining|only/i);
  });
});

/*
  PLAYTIME'S GOAL (the owner, 2026-09-26: "understood, then goals need to be increased if anything
  to 3 hours a day (user still can change) based on the WHO report"). Switching to Playtime sets the
  published three hours and keeps the tummy-time goal; switching back puts it back.
*/
describe('the goal a household’s word for the module brings with it', () => {
  it('offers Playtime its own ladder, in hours, and tummy time keeps its minutes', () => {
    expect(goalChoicesFor(null)).toEqual([5, 15, 30, 60]);
    expect(goalChoicesFor(undefined)).toEqual(GOAL_MINUTE_CHOICES);
    expect(goalChoicesFor('playtime')).toEqual([60, 120, 180]);
    expect(PLAYTIME_GOAL_CHOICES.map(goalMinutesLabel)).toEqual(['1h', '2h', '3h']);
    // every rung is a goal the setting takes, and Custom may go on to the bound
    for (const n of [...GOAL_MINUTE_CHOICES, ...PLAYTIME_GOAL_CHOICES])
      expect(isGoalMinutes(n), `${n}`).toBe(true);
    expect(isGoalMinutes(GOAL_MINUTES_MAX)).toBe(true);
    expect(GOAL_MINUTES_MAX).toBe(240);
  });

  it('sets the playtime goal and keeps the tummy-time goal it replaces', () => {
    const tummy: GoalSettings = { variant: null, goalMinutes: 30, baseGoalMinutes: null };
    expect(graduationSettings(tummy, true, 180)).toEqual({
      variant: 'playtime',
      goalMinutes: 180,
      baseGoalMinutes: 30,
    });
    // a household with no goal yet gets the three hours, and "no goal" is what it keeps
    expect(
      graduationSettings({ variant: null, goalMinutes: null, baseGoalMinutes: null }, true, 180),
    ).toEqual({ variant: 'playtime', goalMinutes: 180, baseGoalMinutes: null });
  });

  it('puts the tummy-time goal back when the switch goes back, whatever playtime’s became', () => {
    const graduated = graduationSettings(
      { variant: null, goalMinutes: 15, baseGoalMinutes: null },
      true,
      180,
    );
    expect(graduated).not.toBeNull();
    // the parent moved playtime's goal to two hours; tummy time's fifteen minutes still come back
    const changed: GoalSettings = { ...graduated!, goalMinutes: 120 };
    expect(graduationSettings(changed, false, 180)).toEqual({
      variant: null,
      goalMinutes: 15,
      baseGoalMinutes: null,
    });
    // and no goal comes back as no goal
    expect(
      graduationSettings(
        { variant: 'playtime', goalMinutes: 180, baseGoalMinutes: null },
        false,
        180,
      ),
    ).toEqual({ variant: null, goalMinutes: null, baseGoalMinutes: null });
  });

  it('writes nothing when the row is already where the switch is going', () => {
    expect(
      graduationSettings({ variant: 'playtime', goalMinutes: 120, baseGoalMinutes: 30 }, true, 180),
    ).toBeNull();
    expect(
      graduationSettings({ variant: null, goalMinutes: 30, baseGoalMinutes: null }, false, 180),
    ).toBeNull();
  });

  it('is undone by writing the setting back as it was, all three together', () => {
    // Undo is the write of the row before: switching on then back again is the row it started as
    const start: GoalSettings = { variant: null, goalMinutes: 5, baseGoalMinutes: null };
    const on = graduationSettings(start, true, 180);
    expect(on).not.toBeNull();
    expect(graduationSettings(on!, false, 180)).toEqual(start);
  });
});
