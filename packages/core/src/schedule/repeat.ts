/**
 * Which days a rule is on, and the one generator that lays a day out at once (docs/
 * SCHEDULE_LOGIC.md §9 "A set of times"; SCHEDULE_AND_LOCATIONS.md §2.1 `repeat`).
 */
import { hhmmOf, hm } from './time';
import type { Rule } from './types';

/** Does the rule occur on this weekday (0 = Sunday)? */
export function repeatsOn(rule: Pick<Rule, 'repeat' | 'repeatDays'>, dow: number): boolean {
  switch (rule.repeat) {
    case 'DAILY':
      return true;
    case 'WEEKDAYS':
      return dow >= 1 && dow <= 5;
    case 'WEEKENDS':
      return dow === 0 || dow === 6;
    case 'CUSTOM':
      return (rule.repeatDays ?? []).includes(dow);
  }
}

/** `07:00`, every 3 h, until `21:00` at the latest → `07:00 · 10:00 · 13:00 · 16:00 · 19:00`.
 *  Twelve at most: a day has room for no more, and a typo of `every 5 min` must not create
 *  two hundred rules. */
export function seriesTimes(from: string, everyMinutes: number, to: string, max = 12): string[] {
  const out: string[] = [];
  const start = hm(from);
  const end = hm(to);
  const step = Math.max(15, Math.round(everyMinutes));
  for (let t = start; t <= end && out.length < max; t += step) out.push(hhmmOf(t));
  return out;
}
