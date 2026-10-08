/**
 * Shared test fixtures: one household in America/New_York on Wednesday 2026-06-10, times as
 * wall-clock strings, so a case reads the way the specification's tables do.
 */
import { zonedToUtc } from '../today/day';
import type { ActivityType } from '../domain/domain-types';
import { ruleFrom, type EngineContext, type Rule, type RuleInput, type Session } from './types';

export const TZ = 'America/New_York';
export interface Day {
  y: number;
  m: number;
  d: number;
}
export const DAY_2026_06_10: Day = { y: 2026, m: 6, d: 10 };

/** The instant the wall clock reads `HH:MM` on the fixture day (or `dayOffset` days away). */
export function at(hhmm: string, dayOffset = 0, day: Day = DAY_2026_06_10): number {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedToUtc(TZ, day.y, day.m, day.d + dayOffset, h ?? 0, m ?? 0);
}

export function ctx(
  nowHHMM: string,
  extra: Partial<EngineContext> = {},
  day: Day = DAY_2026_06_10,
): EngineContext {
  return {
    nowMs: at(nowHHMM, 0, day),
    timeZone: TZ,
    dayStartMs: zonedToUtc(TZ, day.y, day.m, day.d),
    ...extra,
  };
}

let seq = 0;
export function sess(
  type: ActivityType,
  startHHMM: string,
  endHHMM: string | null = null,
  extra: Partial<Session> & { dayOffset?: number; day?: Day } = {},
): Session {
  const { dayOffset = 0, day = DAY_2026_06_10, ...rest } = extra;
  seq += 1;
  return {
    id: rest.id ?? `s${seq}`,
    type,
    childId: null,
    startMs: at(startHHMM, dayOffset, day),
    endMs: endHHMM === null ? null : at(endHHMM, dayOffset, day),
    ...rest,
  };
}

export const rule = (input: RuleInput): Rule => ruleFrom(input);

export const pumpEvery = (minutes: number, extra: Partial<Rule> = {}): Rule =>
  rule({ id: 'r-pump', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: minutes, ...extra });
