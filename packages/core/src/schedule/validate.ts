/**
 * The schema's shape checks, restated so a sheet can refuse before the server does (0001
 * `rule_shape`, `night_shape`, `miss_window_sane`; SCHEDULE_AND_LOCATIONS.md §2.1).
 */
import type { Rule } from './types';

const HHMM = /^\d{2}:\d{2}$/;
const isTime = (v: string | null): v is string => v !== null && HHMM.test(v);

/** The first thing wrong with the rule, as a sentence, or null when the row would insert. */
export function ruleShapeError(rule: Rule): string | null {
  switch (rule.ruleType) {
    case 'FIXED':
      if (!isTime(rule.atLocalTime)) return 'A fixed item needs a time of day.';
      break;
    case 'INTERVAL':
      if (rule.everyMinutes === null || rule.everyMinutes <= 0)
        return 'An interval needs a length.';
      if (rule.everyMinutes < 30 || rule.everyMinutes > 720)
        return 'An interval is between 30 minutes and 12 hours.';
      break;
    case 'RELATIVE':
      if (rule.relativeTo === null || rule.offsetMinutes === null)
        return 'A relative item needs an event and an offset.';
      if (rule.offsetMinutes < 15 || rule.offsetMinutes > 480)
        return 'The offset is between 15 minutes and 8 hours.';
      break;
    case 'CADENCE':
      if (!isTime(rule.atLocalTime)) return 'A cadence needs a reminder time.';
      if (
        (rule.everyDays === null || rule.everyDays < 1 || rule.everyDays > 30) &&
        (rule.repeatDays ?? []).length === 0
      ) {
        return 'A cadence is every so many days, or on chosen days.';
      }
      break;
  }
  if (
    rule.repeat === 'CUSTOM' &&
    rule.ruleType !== 'CADENCE' &&
    (rule.repeatDays ?? []).length === 0
  ) {
    return 'Pick at least one day.';
  }
  if (rule.nightMode !== 'NONE') {
    if (!isTime(rule.nightFrom) || !isTime(rule.nightTo))
      return 'Overnight needs a start and an end.';
    if (
      rule.nightMode === 'LONGER' &&
      (rule.nightEveryMinutes === null || rule.nightEveryMinutes <= 0)
    ) {
      return 'A longer overnight interval needs a length.';
    }
    if (rule.nightMode === 'ONE' && !isTime(rule.nightAt))
      return 'One overnight session needs its time.';
  }
  if (rule.missAfterMinutes < 5 || rule.missAfterMinutes > 720)
    return 'Mark missed after 5 minutes to 12 hours.';
  if (rule.matchWindowMinutes < 5 || rule.matchWindowMinutes > 120)
    return 'The match window is 5 to 120 minutes.';
  if (rule.activity === 'med' && !(rule.name ?? '').trim())
    return 'A medicine reminder needs the name on the bottle.';
  return null;
}
